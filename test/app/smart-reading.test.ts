import { expect, test } from "vitest";
import { blankSkipped, skippedLines, speechText, type EdgeMemory, type PageLine } from "../../app/src/readaloud/smart";
import { bestVoice, rankVoices, voiceQuality } from "../../app/src/readaloud/voices";

/** Lines spread evenly down a page; `at` overrides where one of them sits. */
function page(texts: string[], at: Record<number, [number, number]> = {}): { lines: PageLine[]; text: string } {
  let offset = 0;
  const lines = texts.map((text, i) => {
    const [top, bottom] = at[i] ?? [0.15 + (i * 0.7) / texts.length, 0.17 + (i * 0.7) / texts.length];
    const line = { text, start: offset, end: offset + text.length, top, bottom };
    offset += text.length + 1;
    return line;
  });
  return { lines, text: texts.join("\n") };
}

test("page numbers, figures and symbol rows are not read", () => {
  const { lines } = page(["12", "Page 3 of 80", "The quick brown fox.", "12,400   +8%   3.5", "* * *", "N S E W C"],
    { 1: [0.95, 0.97] });
  expect(skippedLines(lines, 1, new Map())).toEqual([true, true, false, true, true, true]);
});

test("a running header is read once and skipped on later pages", () => {
  const memory: EdgeMemory = new Map();
  const first = page(["Smart Dark Reader Manual", "Chapter one begins here."], { 0: [0.03, 0.05] });
  expect(skippedLines(first.lines, 1, memory)).toEqual([false, false]);
  const second = page(["Smart Dark Reader Manual", "More of chapter one."], { 0: [0.03, 0.05] });
  expect(skippedLines(second.lines, 2, memory)).toEqual([true, false]);
  // Same text in the middle of a page is ordinary text.
  const middle = page(["Intro.", "Smart Dark Reader Manual"]);
  expect(skippedLines(middle.lines, 3, memory)).toEqual([false, false]);
  // Footers that only differ in the page number are the same footer.
  const footerA = page(["Text.", "Annual report 2026 · 14"], { 1: [0.95, 0.97] });
  const footerB = page(["Text.", "Annual report 2026 · 15"], { 1: [0.95, 0.97] });
  expect(skippedLines(footerA.lines, 14, memory)).toEqual([false, true]);
  expect(skippedLines(footerB.lines, 15, memory)).toEqual([false, true]);
  // Reading the same page again does not make its own header a repeat.
  const again: EdgeMemory = new Map();
  skippedLines(first.lines, 1, again);
  expect(skippedLines(first.lines, 1, again)).toEqual([false, false]);
});

test("lines that are only a link are skipped; table rows with words are kept", () => {
  const { lines } = page(["https://example.com/a/b?c=1", "mail@example.com", "North 12,400 +8% On track", "See https://example.com for more."]);
  expect(skippedLines(lines, 1, new Map())).toEqual([true, true, false, false]);
});

test("skipped lines are blanked without moving the rest of the text", () => {
  const { lines, text } = page(["12", "Real text here.", "7"]);
  const blank = blankSkipped(text, lines, [true, false, true]);
  expect(blank).toBe("  \nReal text here.\n ");
  expect(blank.length).toBe(text.length);
});

test("sentences are tidied for speech", () => {
  expect(speechText("Dark mode helps [12], as shown [3, 4] and [5–7].", "en")).toBe("Dark mode helps, as shown and.");
  expect(speechText("This is an exam-\nple of wrapped\ntext.", "en")).toBe("This is an example of wrapped text.");
  expect(speechText("A well-known fact, e.g. this one, i.e. the first.", "en")).toBe("A well-known fact, for example, this one, that is, the first.");
  expect(speechText("See Fig. 3 and Eq. (2) on p. 14, pp. 20-22.", "en")).toBe("See Figure 3 and Equation (2) on page 14, pages 20-22.");
  expect(speechText("Read more at https://example.com/long/path?x=1.", "en")).toBe("Read more at link.");
  expect(speechText("Write to help@example.com today.", "en")).toBe("Write to today.");
  expect(speechText("It was proven.12 Later work agreed.", "en")).toBe("It was proven. Later work agreed.");
  expect(speechText("Smith & Jones et al. agree", "en")).toBe("Smith and Jones and others agree");
  expect(speechText("• First point", "en")).toBe("First point");
  expect(speechText("Introduction ........ 12", "en")).toBe("Introduction");
  expect(speechText("x² + y³", "en")).toBe("x + y");
});

test("numbers that belong to the sentence stay", () => {
  expect(speechText("In 2026 there were 12 of them.", "en")).toBe("In 2026 there were 12 of them.");
  expect(speechText("Version 3.5 costs $20.", "en")).toBe("Version 3.5 costs $20.");
  expect(speechText("Chapter 12", "en")).toBe("Chapter 12");
});

test("nothing to say gives an empty string; Arabic is left in Arabic", () => {
  expect(speechText("[3]", "en")).toBe("");
  expect(speechText("***", "en")).toBe("");
  expect(speechText("انظر https://example.com للمزيد.", "ar")).toBe("انظر رابط للمزيد.");
  expect(speechText("e.g. نص", "ar")).toBe("e.g. نص");
});

const v = (name: string, lang = "en-US", local = true) => ({ uri: name, name, lang, local });

test("device voices are ranked: natural and premium first, robotic and novelty last", () => {
  const voices = [v("Fred"), v("Eddy (English (US))"), v("Samantha"), v("Ava (Premium)"), v("Samantha (Enhanced)"),
    v("Microsoft Aria Online (Natural) - English (United States)", "en-US", false), v("Zarvox"), v("Google US English", "en-US", false),
    v("Amélie", "fr-CA")];
  expect(rankVoices(voices, "en").map((x) => x.name)).toEqual([
    "Microsoft Aria Online (Natural) - English (United States)", "Ava (Premium)", "Samantha (Enhanced)", "Google US English",
    "Samantha", "Eddy (English (US))", "Fred", "Zarvox",
  ]);
  expect(bestVoice(voices, "en")?.name).toBe("Microsoft Aria Online (Natural) - English (United States)");
  expect(bestVoice(voices, "fr")?.name).toBe("Amélie");
  expect(bestVoice(voices, "ar")).toBeNull();
  expect(voiceQuality(v("Maged", "ar-SA"))).toBeGreaterThan(voiceQuality(v("Unknown", "ar-SA")));
});

test("equal voices: the device's region comes first", () => {
  const voices = [v("Daniel", "en-GB"), v("Karen", "en-AU"), v("Samantha", "en-US")];
  expect(rankVoices(voices, "en", "en-GB")[0].name).toBe("Daniel");
  expect(rankVoices(voices, "en", "en-AU")[0].name).toBe("Karen");
});
