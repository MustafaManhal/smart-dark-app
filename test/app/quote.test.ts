// @vitest-environment node
import { expect, test } from "vitest";
import { quoteFontSize, quoteText, wrapLines } from "../../app/src/annotations/quote";

test("a quote as text names the book, the author and the page", () => {
  expect(quoteText("  To be, or not to be. ", { title: "Hamlet", author: "W. Shakespeare", page: 63 }))
    .toBe("“To be, or not to be.”\nHamlet, W. Shakespeare, page 63");
  expect(quoteText("Words", { title: "Untitled scan", author: "", page: 2 })).toBe("“Words”\nUntitled scan, page 2");
});

// Every letter is 10 wide: a line of width 100 holds 10 letters.
const measure = (s: string) => s.length * 10;

test("lines break at spaces and never run past the width", () => {
  const lines = wrapLines("the quick brown fox jumps over the lazy dog", 100, measure);
  expect(lines).toEqual(["the quick", "brown fox", "jumps over", "the lazy", "dog"]);
  expect(lines.every((l) => measure(l) <= 100)).toBe(true);
});

test("a word longer than a line is cut, and paragraphs stay apart", () => {
  const lines = wrapLines("an extraordinarilylongword here\nnext", 100, measure);
  expect(lines.every((l) => measure(l) <= 100)).toBe(true);
  expect(lines.join("").replace(/\s/g, "")).toBe("anextraordinarilylongwordherenext");
  expect(lines.at(-1)).toBe("next");
});

test("short passages get large letters, long ones smaller", () => {
  expect(quoteFontSize(40)).toBeGreaterThan(quoteFontSize(200));
  expect(quoteFontSize(200)).toBeGreaterThan(quoteFontSize(400));
  expect(quoteFontSize(400)).toBeGreaterThan(quoteFontSize(800));
});
