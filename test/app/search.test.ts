import { expect, test } from "vitest";
import { findInPage, fold, indexPage } from "../../app/src/reader/search";

const page = (...lines: string[]) => indexPage(lines.map((str) => ({ str, hasEOL: true })));

test("folding ignores case, accents and extra spaces, and maps back to the text", () => {
  const { folded, map } = fold("  Café   DÉJÀ\nvu ");
  expect(folded).toBe("cafe deja vu");
  expect(map[0]).toBe(2); // "c" is the third character of the text
  expect(map.at(-1)).toBe(17);
});

test("finds every match with its place in the text and a snippet around it", () => {
  const index = page("Dark pages keep their colors.", "A dark page is easier at night; DARK mode helps.");
  const found = findInPage(index, "dark", 3);
  expect(found.map((m) => index.text.slice(m.start, m.end))).toEqual(["Dark", "dark", "DARK"]);
  expect(found[0]).toMatchObject({ page: 3, before: "", hit: "Dark", after: " pages keep their colors. A dark page is" });
  expect(found[1].parts).toEqual([{ item: 1, from: 2, to: 6 }]);
  expect(findInPage(index, "   ", 3)).toEqual([]);
  expect(findInPage(index, "missing", 3)).toEqual([]);
});

test("a phrase is found across a line break, and a word split by a hyphen is found whole", () => {
  const index = page("the highlighted words keep a visible yel-", "low band and colored", "words keep their hue");
  const band = findInPage(index, "yellow band", 1);
  expect(band).toHaveLength(1);
  expect(band[0].parts).toEqual([{ item: 0, from: 37, to: 41 }, { item: 1, from: 0, to: 8 }]);
  const across = findInPage(index, "colored  words", 1);
  expect(across).toHaveLength(1);
  expect(across[0].hit).toBe("colored words");
  // A real hyphen stays: "well-known" does not match "wellknown".
  expect(findInPage(page("a well-known fact"), "wellknown", 1)).toEqual([]);
  expect(findInPage(page("a well-known fact"), "well-known", 1)).toHaveLength(1);
});

test("Arabic is matched without diacritics and with alef and ya forms folded", () => {
  const index = page("هَذَا كِتَابٌ جَمِيلٌ", "إلى الأصدقاء في المكتبـــة");
  expect(findInPage(index, "كتاب", 1)).toHaveLength(1);
  expect(findInPage(index, "الي الاصدقاء", 1)).toHaveLength(1);
  expect(findInPage(index, "المكتبه", 1)).toHaveLength(1);
  const hit = findInPage(index, "كتاب", 1)[0];
  expect(index.text.slice(hit.start, hit.end)).toBe("كِتَابٌ");
});

test("the place down the page comes from the item the match starts in", () => {
  const index = indexPage([{ str: "top line", hasEOL: true }, { str: "bottom line" }], (item) => (item.str.startsWith("top") ? 0.1 : 0.8));
  expect(findInPage(index, "bottom", 1)[0].y).toBe(0.8);
  expect(findInPage(index, "line", 1).map((m) => m.y)).toEqual([0.1, 0.8]);
});
