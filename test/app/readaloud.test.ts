import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { detectLanguage, splitSentences } from "../../app/src/readaloud/text";
import { Speaker } from "../../app/src/readaloud/speaker";

test("splits text into sentences with character ranges", () => {
  const text = "First sentence. Second one?  Third!";
  const s = splitSentences(text, "en");
  expect(s.map((x) => x.text)).toEqual(["First sentence.", "Second one?", "Third!"]);
  for (const x of s) expect(text.slice(x.start, x.end)).toBe(x.text);
});

test("very long sentences are cut into speakable pieces", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + ", and the end.";
  const parts = splitSentences(long, "en");
  expect(parts.length).toBeGreaterThan(1);
  expect(Math.max(...parts.map((p) => p.text.length))).toBeLessThanOrEqual(220);
  expect(parts.map((p) => p.text).join(" ")).toBe(long);
});

test("detects Arabic and Latin text", () => {
  expect(detectLanguage("مرحبا بك في القارئ", "en")).toBe("ar");
  expect(detectLanguage("Hello and welcome", "ar")).toBe("en");
  expect(detectLanguage("1234 —", "en")).toBe("en");
});

test("Arabic question mark ends a sentence", () => {
  const s = splitSentences("ما هذا؟ هذا كتاب.", "ar");
  expect(s.map((x) => x.text)).toEqual(["ما هذا؟", "هذا كتاب."]);
});

// A stand-in for speechSynthesis: every utterance "speaks" for 10ms.
class FakeSynth {
  spoken: SpeechSynthesisUtterance[] = [];
  current: SpeechSynthesisUtterance | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;
  speak(u: SpeechSynthesisUtterance) {
    this.spoken.push(u);
    this.current = u;
    u.onstart?.(new Event("start") as SpeechSynthesisEvent);
    this.timer = setTimeout(() => { this.current = null; u.onend?.(new Event("end") as SpeechSynthesisEvent); }, 10);
  }
  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.current = null; // like Safari: no end event on cancel
  }
  getVoices() { return []; }
}

class FakeUtterance {
  rate = 1; pitch = 1; lang = ""; voice = null;
  onstart: ((e: Event) => void) | null = null;
  onend: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  constructor(public text: string) {}
}

let synth: FakeSynth;
beforeEach(() => {
  synth = new FakeSynth();
  vi.stubGlobal("speechSynthesis", synth);
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => vi.unstubAllGlobals());

test("speaks sentences one after another and reports progress", async () => {
  const seen: number[] = [];
  const speaker = new Speaker({ onSentence: (i) => seen.push(i) });
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.play(splitSentences("One. Two. Three.", "en"), 0, { rate: 1.5, pitch: 1, voiceURI: null, lang: "en" });
  await done;
  expect(synth.spoken.map((u) => u.text)).toEqual(["One.", "Two.", "Three."]);
  expect(synth.spoken[0].rate).toBe(1.5);
  expect(seen).toEqual([0, 1, 2]);
});

test("pause stops speaking and resume continues from the same sentence", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  speaker.play(splitSentences("One. Two. Three.", "en"), 0, { rate: 1, pitch: 1, voiceURI: null, lang: "en" });
  await new Promise((r) => setTimeout(r, 15)); // "One." done, "Two." started
  speaker.pause();
  expect(speaker.state).toBe("paused");
  const count = synth.spoken.length;
  await new Promise((r) => setTimeout(r, 30));
  expect(synth.spoken.length).toBe(count); // nothing new while paused
  const done = new Promise<void>((r) => (speaker.onQueueEnd = r));
  speaker.resume();
  await done;
  expect(synth.spoken.slice(count).map((u) => u.text)).toEqual(["Two.", "Three."]);
});

test("stop ends playback and a late end event does not restart it", async () => {
  const speaker = new Speaker({ onSentence: () => {} });
  speaker.play(splitSentences("One. Two.", "en"), 0, { rate: 1, pitch: 1, voiceURI: null, lang: "en" });
  speaker.stop();
  synth.spoken[0].onend?.(new Event("end") as SpeechSynthesisEvent); // stale event
  await new Promise((r) => setTimeout(r, 30));
  expect(synth.spoken).toHaveLength(1);
  expect(speaker.state).toBe("idle");
});

test("short lines such as headings and captions are their own sentences", () => {
  const text = "Revenue by region\nN S E W C\nPhoto: kept in its real colors.\nThis line is long enough to be part of a paragraph that wraps\nonto the next line without a break.";
  expect(splitSentences(text, "en").map((s) => s.text)).toEqual([
    "Revenue by region",
    "N S E W C",
    "Photo: kept in its real colors.",
    "This line is long enough to be part of a paragraph that wraps\nonto the next line without a break.",
  ]);
});
