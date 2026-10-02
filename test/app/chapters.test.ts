import { expect, test } from "vitest";
import { chapterProgress, currentChapter } from "../../app/src/reader/chapters";

const outline = [
  { title: "Intro", page: 1, depth: 0 },
  { title: "Part", page: 1, depth: 1 },
  { title: "One", page: 5, depth: 0 },
  { title: "Two", page: 11, depth: 0 },
];

test("finds the top-level chapter that contains the page", () => {
  expect(currentChapter(outline, 7, 20)).toMatchObject({ index: 1, startPage: 5, endPage: 10 });
  expect(currentChapter(outline, 15, 20)).toMatchObject({ index: 2, startPage: 11, endPage: 20 });
});

test("chapter progress runs from 0 at the first page to 1 at the last", () => {
  expect(chapterProgress(outline, 5, 20)).toBeCloseTo(1 / 6);
  expect(chapterProgress(outline, 10, 20)).toBe(1);
});

test("no outline means no chapter", () => {
  expect(currentChapter([], 3, 10)).toBeNull();
  expect(chapterProgress([], 3, 10)).toBeNull();
});
