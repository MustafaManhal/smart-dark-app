import { expect, test } from "vitest";
import { notesToMarkdown } from "../../app/src/annotations/markdown";
import { counts, noteItems } from "../../app/src/annotations/noteItems";
import type { BookAnnotations } from "../../app/src/db/annotations";

const rect = (y: number) => [{ x: 0.1, y, w: 0.2, h: 0.02 }];
const data: BookAnnotations = {
  highlights: [
    { id: "h1", bookId: "b", page: 3, rects: rect(0.5), color: "yellow", text: "First quote", createdAt: 1, updatedAt: 1 },
    { id: "h2", bookId: "b", page: 3, rects: rect(0.2), color: "green", text: "Second quote", createdAt: 2, updatedAt: 2 },
  ],
  notes: [{ id: "n1", bookId: "b", page: 1, rects: rect(0.3), text: "passage", body: "Important idea", createdAt: 5, updatedAt: 5 }],
  stickies: [{ id: "s1", bookId: "b", page: 2, x: 0, y: 0, color: "pink", text: "Call Ana", collapsed: false, createdAt: 3, updatedAt: 3 }],
  bookmarks: [{ id: "k1", bookId: "b", page: 5, createdAt: 4 }],
};
const opts = { color: null, query: "" };

test("each kind is listed on its own, in reading order", () => {
  expect(noteItems(data, { ...opts, kind: "highlights" }).map((i) => i.id)).toEqual(["h2", "h1"]);
  expect(noteItems(data, { ...opts, kind: "notes" }).map((i) => i.id)).toEqual(["n1"]);
  expect(noteItems(data, { ...opts, kind: "sticky" }).map((i) => i.id)).toEqual(["s1"]);
  expect(noteItems(data, { ...opts, kind: "bookmarks" }).map((i) => i.id)).toEqual(["k1"]);
  expect(counts(data)).toEqual({ highlights: 2, notes: 1, sticky: 1, bookmarks: 1 });
});

test("filters by color and search text", () => {
  expect(noteItems(data, { kind: "highlights", color: "green", query: "" }).map((i) => i.id)).toEqual(["h2"]);
  expect(noteItems(data, { kind: "sticky", color: null, query: "ana" }).map((i) => i.id)).toEqual(["s1"]);
  expect(noteItems(data, { kind: "notes", color: null, query: "IDEA" }).map((i) => i.id)).toEqual(["n1"]);
});

test("markdown export has a section per kind", () => {
  const md = notesToMarkdown("My book", data);
  expect(md).toContain("# My book");
  expect(md).toContain("## Highlights\n\n- p. 3: “Second quote”\n- p. 3: “First quote”");
  expect(md).toContain("### Page 1\n\n> passage\n\nImportant idea");
  expect(md).toContain("- p. 2: Call Ana");
  expect(md).toContain("## Bookmarks\n\n- Page 5");
});
