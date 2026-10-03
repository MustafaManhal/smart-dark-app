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

/**
 * Speaks a list of sentences one utterance at a time. Pausing cancels and
 * remembers the sentence (pause() is a cancel on Android anyway), and a
 * generation counter ignores events from cancelled utterances.
 */
export class Speaker {
  state: SpeakerState = "idle";
  index = 0;
  onQueueEnd: () => void = () => {};
  private sentences: Sentence[] = [];
  private opts: SpeakOptions = { rate: 1, pitch: 1, voiceURI: null, lang: "en" };
  private generation = 0;

  constructor(private events: { onSentence: (index: number) => void; onState?: (s: SpeakerState) => void }) {}

  private setState(s: SpeakerState) {
    this.state = s;
    this.events.onState?.(s);
  }

  /** Must be called from a tap/click the first time (iOS requires a user gesture). */
  play(sentences: Sentence[], from: number, opts: SpeakOptions) {
    this.sentences = sentences;
    this.opts = opts;
    this.index = Math.max(0, Math.min(from, sentences.length));
    this.setState("playing");
    this.speakCurrent();
  }

  setOptions(opts: Partial<SpeakOptions>) {
    this.opts = { ...this.opts, ...opts };
    if (this.state === "playing") this.speakCurrent(); // restart the sentence with the new voice/speed
  }

  pause() {
    if (this.state !== "playing") return;
    this.generation++;
    globalThis.speechSynthesis?.cancel();
    this.setState("paused");
  }

  resume() {
    if (this.state !== "paused") return;
    this.setState("playing");
    this.speakCurrent();
  }

  stop() {
    this.generation++;
    globalThis.speechSynthesis?.cancel();
    this.setState("idle");
  }

  skip(delta: number) {
    this.index = Math.max(0, Math.min(this.sentences.length - 1, this.index + delta));
    if (this.state === "playing") this.speakCurrent();
    else this.events.onSentence(this.index);
  }

  private speakCurrent() {
    const synth = globalThis.speechSynthesis;
    const gen = ++this.generation;
    synth?.cancel();
    const sentence = this.sentences[this.index];
    if (!synth || !sentence) {
      this.setState("idle");
      this.onQueueEnd();
      return;
    }
    const u = new SpeechSynthesisUtterance(sentence.text);
    u.rate = this.opts.rate;
    u.pitch = this.opts.pitch;
    u.lang = this.opts.lang;
    const voice = this.opts.voiceURI ? synth.getVoices().find((v) => v.voiceURI === this.opts.voiceURI) : undefined;
    if (voice) u.voice = voice;
    const next = () => {
      if (gen !== this.generation || this.state !== "playing") return;
      this.index++;
      if (this.index >= this.sentences.length) {
        this.setState("idle");
        this.onQueueEnd();
      } else this.speakCurrent();
    };
    u.onend = next;
    u.onerror = (e) => {
      // "interrupted"/"canceled" come from our own cancel(); anything else skips the sentence.
      const error = (e as SpeechSynthesisErrorEvent).error;
      if (error !== "interrupted" && error !== "canceled") next();
    };
    this.events.onSentence(this.index);
    synth.speak(u);
  }
}
