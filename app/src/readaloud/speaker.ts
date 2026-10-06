import { naturalId, synthesize } from "./neural";
import type { Sentence } from "./text";

export type Voice = { uri: string; name: string; lang: string; local: boolean };
export type SpeakOptions = { rate: number; pitch: number; voiceURI: string | null; lang: string };
export type SpeakerState = "idle" | "playing" | "paused";

/** Voices load asynchronously in Chrome/Firefox; Safari has them at once. */
export function loadVoices(timeout = 1500): Promise<Voice[]> {
  const synth = globalThis.speechSynthesis;
  if (!synth) return Promise.resolve([]);
  const read = () => synth.getVoices().map((v) => ({ uri: v.voiceURI, name: v.name, lang: v.lang, local: v.localService }));
  const now = read();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(read());
    synth.onvoiceschanged = done; // property, not addEventListener: older Safari lacks it here
    setTimeout(done, timeout);
  });
}

let audioContext: AudioContext | null = null;
/** One audio output for natural voices. Call from a tap the first time: browsers start it suspended. */
function audio() {
  const Ctx = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  audioContext ??= new Ctx!();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  return audioContext;
}

type Events = {
  onSentence: (index: number) => void;
  onState?: (s: SpeakerState) => void;
  /** A natural voice is still preparing the sentence (first load, or a slow computer). */
  onWaiting?: (waiting: boolean) => void;
  /** The natural voice failed; reading goes on with a device voice. */
  onFallback?: () => void;
};

/**
 * Speaks a list of sentences one at a time, with a device voice (Web Speech)
 * or a natural voice (neural.ts). Pausing cancels and remembers the sentence
 * (pause() is a cancel on Android anyway), and a generation counter ignores
 * events from cancelled sentences.
 */
export class Speaker {
  state: SpeakerState = "idle";
  index = 0;
  onQueueEnd: () => void = () => {};
  /** Device voice used when no voice was chosen, or when a natural voice fails. */
  fallbackVoiceURI: string | null = null;
  private sentences: Sentence[] = [];
  private opts: SpeakOptions = { rate: 1, pitch: 1, voiceURI: null, lang: "en" };
  private generation = 0;
  private source: AudioBufferSourceNode | null = null;
  private clips = new Map<string, Promise<AudioBuffer>>();
  private naturalFailed = false;

  constructor(private events: Events) {}

  private setState(s: SpeakerState) {
    this.state = s;
    this.events.onState?.(s);
  }

  /** The natural voice in use, if any. They speak English only. */
  private natural() {
    return this.naturalFailed || !this.opts.lang.startsWith("en") ? null : naturalId(this.opts.voiceURI);
  }

  /** Must be called from a tap/click the first time (iOS requires a user gesture). */
  play(sentences: Sentence[], from: number, opts: SpeakOptions) {
    this.sentences = sentences;
    this.opts = opts;
    this.clips.clear();
    this.index = Math.max(0, Math.min(from, sentences.length));
    if (this.natural()) audio();
    this.setState("playing");
    this.speakCurrent();
  }

  setOptions(opts: Partial<SpeakOptions>) {
    if (opts.voiceURI !== undefined && opts.voiceURI !== this.opts.voiceURI) this.naturalFailed = false;
    this.opts = { ...this.opts, ...opts };
    if (this.state === "playing") this.speakCurrent(); // restart the sentence with the new voice/speed
  }

  private silence() {
    this.generation++;
    globalThis.speechSynthesis?.cancel();
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {}
      this.source = null;
    }
    this.events.onWaiting?.(false);
  }

  pause() {
    if (this.state !== "playing") return;
    this.silence();
    this.setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    if (this.natural()) audio();
    this.setState("playing");
    this.speakCurrent();
  }

  stop() {
    this.silence();
    this.setState("idle");
  }

  skip(delta: number) {
    this.index = Math.max(0, Math.min(this.sentences.length - 1, this.index + delta));
    if (this.state === "playing") this.speakCurrent();
    else this.events.onSentence(this.index);
  }

  private speakCurrent() {
    this.silence();
    const gen = this.generation;
    const sentence = this.sentences[this.index];
    if (!sentence) {
      this.setState("idle");
      this.onQueueEnd();
      return;
    }
    this.events.onSentence(this.index);
    const voice = this.natural();
    if (voice) this.speakNatural(gen, voice);
    else this.speakDevice(gen, sentence);
  }

  private next(gen: number) {
    if (gen !== this.generation || this.state !== "playing") return;
    this.index++;
    if (this.index >= this.sentences.length) {
      this.setState("idle");
      this.onQueueEnd();
    } else this.speakCurrent();
  }

  private speakDevice(gen: number, sentence: Sentence) {
    const synth = globalThis.speechSynthesis;
    if (!synth) {
      this.setState("idle");
      this.onQueueEnd();
      return;
    }
    const u = new SpeechSynthesisUtterance(sentence.say ?? sentence.text);
    u.rate = this.opts.rate;
    u.pitch = this.opts.pitch;
    u.lang = this.opts.lang;
    const uri = naturalId(this.opts.voiceURI) || !this.opts.voiceURI ? this.fallbackVoiceURI : this.opts.voiceURI;
    const voice = uri ? synth.getVoices().find((v) => v.voiceURI === uri) : undefined;
    try {
      if (voice) u.voice = voice;
    } catch {} // keep the browser's own voice
    u.onend = () => this.next(gen);
    u.onerror = (e) => {
      // "interrupted"/"canceled" come from our own cancel(); anything else skips the sentence.
      const error = (e as SpeechSynthesisErrorEvent).error;
      if (error !== "interrupted" && error !== "canceled") this.next(gen);
    };
    synth.speak(u);
  }

  /** The sentence as sound, made once per voice and speed. */
  private clip(index: number, voice: string) {
    const key = `${index}|${voice}|${this.opts.rate}`;
    let clip = this.clips.get(key);
    if (!clip) {
      const sentence = this.sentences[index];
      clip = synthesize(sentence.say ?? sentence.text, voice, this.opts.rate).then((wav) => audio().decodeAudioData(wav));
      clip.catch(() => this.clips.delete(key));
      this.clips.set(key, clip);
    }
    return clip;
  }

  private async speakNatural(gen: number, voice: string) {
    const index = this.index;
    const slow = setTimeout(() => gen === this.generation && this.events.onWaiting?.(true), 300);
    let buffer: AudioBuffer;
    try {
      buffer = await this.clip(index, voice);
    } catch {
      clearTimeout(slow);
      if (gen !== this.generation) return;
      // Keep reading with a device voice instead of going silent.
      this.events.onWaiting?.(false);
      this.naturalFailed = true;
      this.events.onFallback?.();
      this.speakDevice(gen, this.sentences[index]);
      return;
    }
    clearTimeout(slow);
    if (gen !== this.generation || this.state !== "playing") return;
    this.events.onWaiting?.(false);
    const ctx = audio();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => this.next(gen);
    this.source = source;
    source.start();
    // Prepare what comes next while this sentence plays, and forget what was read.
    for (const ahead of [index + 1, index + 2]) if (this.sentences[ahead]) this.clip(ahead, voice).catch(() => {});
    for (const key of this.clips.keys()) if (Number(key.split("|")[0]) < index) this.clips.delete(key);
  }
}

let previewGeneration = 0;
let previewSource: AudioBufferSourceNode | null = null;

/** Says one line with a voice, to choose by ear. Call from a tap. Resolves when it started or failed. */
export async function previewVoice(voiceURI: string, text: string, lang: string, rate: number): Promise<boolean> {
  const gen = ++previewGeneration;
  globalThis.speechSynthesis?.cancel();
  try {
    previewSource?.stop();
  } catch {}
  previewSource = null;
  const natural = naturalId(voiceURI);
  if (natural) {
    const ctx = audio();
    try {
      const buffer = await ctx.decodeAudioData(await synthesize(text, natural, rate));
      if (gen !== previewGeneration) return true;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      previewSource = source;
      source.start();
      return true;
    } catch {
      return false;
    }
  }
  const synth = globalThis.speechSynthesis;
  if (!synth) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = lang;
  const voice = synth.getVoices().find((v) => v.voiceURI === voiceURI);
  try {
    if (voice) u.voice = voice;
  } catch {}
  synth.speak(u);
  return true;
}

export function stopPreview() {
  previewGeneration++;
  globalThis.speechSynthesis?.cancel();
  try {
    previewSource?.stop();
  } catch {}
  previewSource = null;
}
