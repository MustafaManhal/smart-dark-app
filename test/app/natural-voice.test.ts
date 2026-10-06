import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The speech model is replaced by a stand-in: each sentence becomes a "WAV" that names it.
const made: { text: string; voice: string; speed: number }[] = [];
let failOn: string | null = null;
vi.mock("../../app/src/readaloud/neural", () => ({
  naturalId: (uri: string | null) => (uri?.startsWith("natural:") ? uri.slice(8) : null),
  synthesize: async (text: string, voice: string, speed: number) => {
    made.push({ text, voice, speed });
    if (failOn && text.includes(failOn)) throw new Error("no voice");
    return new TextEncoder().encode(text).buffer;
  },
}));

const { Speaker, previewVoice } = await import("../../app/src/readaloud/speaker");
const { splitSentences } = await import("../../app/src/readaloud/text");

// An audio output that "plays" every clip for 10 ms.
const played: string[] = [];
class FakeSource {
  buffer: { text: string } | null = null;
  onended: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  connect() {}
  start() {
    played.push(this.buffer!.text);
    this.timer = setTimeout(() => this.onended?.(), 10);
  }
  stop() {
    clearTimeout(this.timer);
  }
}
class FakeAudioContext {
  state = "running";
  destination = {};
  resume() { return Promise.resolve(); }
  createBufferSource() { return new FakeSource(); }
  async decodeAudioData(wav: ArrayBuffer) { return { text: new TextDecoder().decode(wav) }; }
}

const spoken: { text: string; voice: unknown }[] = [];
class FakeUtterance {
  rate = 1; pitch = 1; lang = ""; voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

beforeEach(() => {
  made.length = played.length = spoken.length = 0;
  failOn = null;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    speak(u: FakeUtterance) {
      spoken.push({ text: u.text, voice: u.voice });
      setTimeout(() => u.onend?.(), 5);
    },
    cancel() {},
    getVoices: () => [{ voiceURI: "device-best", name: "Best" }, { voiceURI: "device-other", name: "Other" }],
  });
});
afterEach(() => vi.unstubAllGlobals());

const natural = { rate: 1.25, pitch: 1, voiceURI: "natural:af_heart", lang: "en" };

test("a natural voice plays the sentences in order, at the chosen speed, preparing the next ones ahead", async () => {
  const seen: number[] = [];
  const speaker = new Speaker({ onSentence: (i) => seen.push(i) });
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play(splitSentences("One. Two. Three. Four.", "en"), 0, natural);
  await new Promise((r) => setTimeout(r, 5));
  // While "One." plays, the next two are already being made.
  expect(made.map((m) => m.text)).toEqual(["One.", "Two.", "Three."]);
  await done;
  expect(played).toEqual(["One.", "Two.", "Three.", "Four."]);
  expect(made).toHaveLength(4); // each sentence made once
  expect(made.every((m) => m.voice === "af_heart" && m.speed === 1.25)).toBe(true);
  expect(seen).toEqual([0, 1, 2, 3]);
  expect(spoken).toHaveLength(0);
});

test("the spoken form of a sentence is used when it has one", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play([{ text: "See Fig. 3 [12].", start: 0, end: 16, say: "See Figure 3." }], 0, natural);
  await done;
  expect(played).toEqual(["See Figure 3."]);
});

test("pause stops the sound and resume starts the same sentence again", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  speaker.play(splitSentences("One. Two. Three.", "en"), 0, natural);
  await new Promise((r) => setTimeout(r, 15)); // "One." done, "Two." playing
  speaker.pause();
  const count = played.length;
  await new Promise((r) => setTimeout(r, 30));
  expect(played.length).toBe(count);
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.resume();
  await done;
  expect(played.slice(count)).toEqual(["Two.", "Three."]);
});

test("when the natural voice fails, reading goes on with the best device voice", async () => {
  failOn = "Two";
  let fellBack = 0;
  const speaker = new Speaker({ onSentence: () => {}, onFallback: () => fellBack++ });
  speaker.fallbackVoiceURI = "device-best";
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play(splitSentences("One. Two. Three.", "en"), 0, natural);
  await done;
  expect(played).toEqual(["One."]);
  expect(spoken.map((s) => s.text)).toEqual(["Two.", "Three."]);
  expect(spoken.every((s) => (s.voice as { voiceURI: string }).voiceURI === "device-best")).toBe(true);
  expect(fellBack).toBe(1);
});

test("natural voices read English only; other languages use the device voice", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  speaker.fallbackVoiceURI = "device-other";
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play(splitSentences("ما هذا؟ هذا كتاب.", "ar"), 0, { ...natural, lang: "ar" });
  await done;
  expect(made).toHaveLength(0);
  expect(spoken.map((s) => s.text)).toEqual(["ما هذا؟", "هذا كتاب."]);
});

test("with no voice chosen the best device voice reads, not the system default", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  speaker.fallbackVoiceURI = "device-best";
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play(splitSentences("Hello.", "en"), 0, { rate: 1, pitch: 1, voiceURI: null, lang: "en" });
  await done;
  expect((spoken[0].voice as { voiceURI: string }).voiceURI).toBe("device-best");
});

test("a voice can be heard before it is chosen", async () => {
  expect(await previewVoice("natural:bf_emma", "Sample line.", "en", 1)).toBe(true);
  expect(made.at(-1)).toEqual({ text: "Sample line.", voice: "bf_emma", speed: 1 });
  expect(played).toEqual(["Sample line."]);
  expect(await previewVoice("device-other", "Sample line.", "en", 1.5)).toBe(true);
  expect((spoken[0].voice as { voiceURI: string }).voiceURI).toBe("device-other");
});
