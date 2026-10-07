// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { aiSupport, anyAi, checkAi, pieces, SameLanguage, summarize, translate } from "../../app/src/ai/builtin";

afterEach(() => {
  for (const name of ["Summarizer", "Translator", "LanguageDetector", "LanguageModel"]) delete (globalThis as Record<string, unknown>)[name];
});

test("a browser without its own model supports nothing", async () => {
  expect(aiSupport()).toEqual({ summarize: false, translate: false, explain: false });
  expect(anyAi()).toBe(false);
  expect(await checkAi()).toEqual({ summarize: false, translate: false, explain: false });
});

test("an API whose model cannot run on this computer counts as not there", async () => {
  (globalThis as Record<string, unknown>).Summarizer = { availability: async () => "unavailable" };
  (globalThis as Record<string, unknown>).LanguageModel = { availability: async () => "downloadable" };
  (globalThis as Record<string, unknown>).Translator = { availability: async () => { throw new Error("blocked"); } };
  expect(aiSupport()).toEqual({ summarize: true, translate: true, explain: true });
  expect(await checkAi()).toEqual({ summarize: false, translate: false, explain: true });
});

test("a long text is cut at the ends of sentences into pieces the model can take", () => {
  const sentence = "The keeper climbed the steps to the lamp room. ";
  const text = sentence.repeat(50);
  const parts = pieces(text, 500);
  expect(parts.length).toBeGreaterThan(4);
  expect(parts.every((p) => p.length <= 500 && p.endsWith("."))).toBe(true);
  expect(parts.join(" ")).toBe(text.trim());
  expect(pieces("short")).toEqual(["short"]);
});

test("a long text is summarized piece by piece and then as a whole", async () => {
  const calls: string[] = [];
  (globalThis as Record<string, unknown>).Summarizer = {
    availability: async () => "available",
    create: async () => ({ summarize: async (text: string) => { calls.push(text); return `sum(${text.length})`; } }),
  };
  const steps: number[] = [];
  const out = await summarize("A sentence that ends here. ".repeat(900), undefined, (done) => steps.push(done));
  expect(calls.length).toBeGreaterThan(2);
  expect(calls.at(-1)).toContain("sum("); // the last call reads the notes of the pieces
  expect(out).toMatch(/^sum\(\d+\)$/);
  expect(steps).toEqual(Array.from({ length: calls.length }, (_, i) => i));
});

test("translation finds the language of the text and says so when the model cannot do the pair", async () => {
  const pairs: unknown[] = [];
  (globalThis as Record<string, unknown>).LanguageDetector = { create: async () => ({ detect: async () => [{ detectedLanguage: "fr", confidence: 0.9 }] }) };
  (globalThis as Record<string, unknown>).Translator = {
    availability: async (pair: { targetLanguage: string }) => (pair.targetLanguage === "xx" ? "unavailable" : "available"),
    create: async (pair: object) => { pairs.push(pair); return { translate: async (text: string) => `[ar] ${text}` }; },
  };
  expect(await translate("Bonjour", "ar")).toBe("[ar] Bonjour");
  expect(pairs[0]).toMatchObject({ sourceLanguage: "fr", targetLanguage: "ar" });
  await expect(translate("Bonjour", "fr")).rejects.toBeInstanceOf(SameLanguage); // already in that language
  await expect(translate("Bonjour", "xx")).rejects.toThrow("cannot do this");
});
