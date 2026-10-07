// @vitest-environment node
import { expect, test } from "vitest";
import { definitionsFrom, wiktionaryPage, wordToLookUp } from "../../app/src/lookup/dictionary";

const strip = (html: string) => html.replace(/<[^>]+>/g, "").trim();

test("a selection is a word to look up when it is one to three words", () => {
  expect(wordToLookUp("  lighthouse, ")).toBe("lighthouse");
  expect(wordToLookUp("“harbor bell”")).toBe("harbor bell");
  expect(wordToLookUp("the harbor bell rang twice")).toBeNull();
  expect(wordToLookUp("...")).toBeNull();
  expect(wordToLookUp("فنار")).toBe("فنار");
  expect(wiktionaryPage("harbor bell")).toBe("https://en.wiktionary.org/wiki/harbor_bell");
});

test("the dictionary's answer is tidied: the word's language first, tags gone, a few meanings each", () => {
  const raw = {
    fr: [{ partOfSpeech: "Noun", language: "French", definitions: [{ definition: "<a href='/x'>pain</a> (bread)" }] }],
    en: [
      { partOfSpeech: "Noun", language: "English", definitions: [{ definition: "An <b>ache</b>." }, { definition: "" }, { definition: "Suffering." }, { definition: "3" }, { definition: "4" }, { definition: "5" }] },
      { partOfSpeech: "Verb", language: "English", definitions: [{ definition: "To hurt." }] },
    ],
  };
  const out = definitionsFrom(raw, "pain", strip);
  expect(out.map((d) => [d.language, d.partOfSpeech])).toEqual([["English", "Noun"], ["English", "Verb"], ["French", "Noun"]]);
  expect(out[0].meanings).toEqual(["An ache.", "Suffering.", "3", "4"]);
  expect(out[2].meanings).toEqual(["pain (bread)"]);
  // An Arabic word asks for its Arabic entry first.
  const ar = definitionsFrom({ en: [{ language: "English", partOfSpeech: "Noun", definitions: [{ definition: "x" }] }], ar: [{ language: "Arabic", partOfSpeech: "Noun", definitions: [{ definition: "lighthouse" }] }] }, "فنار", strip);
  expect(ar[0].language).toBe("Arabic");
  expect(definitionsFrom({}, "nothing", strip)).toEqual([]);
});
