// @vitest-environment node
import { expect, test } from "vitest";
import type { BookAnnotations } from "../../app/src/db/annotations";
import type { Book } from "../../app/src/db/repos";
import { byBook, filterNotebook, notebookAnki, notebookCsv, notebookItems, notebookMarkdown, type NotebookFilter } from "../../app/src/notebook/items";

const book = (id: string, title: string, extra: Partial<Book> = {}): Book => ({
  id, hash: id, title, author: "", pageCount: 9, fileName: `${id}.pdf`, fileSize: 1, addedAt: 0, lastOpenedAt: null, finishedAt: null, ...extra,
});
const books = [book("b1", "Zoology", { author: "A. Naturalist", tags: ["biology"] }), book("b2", "Algebra", { tags: ["math", "Exam 2026"] })];
const all: BookAnnotations = {
  highlights: [
    { id: "h1", bookId: "b1", page: 4, rects: [], color: "yellow", text: "the walrus sleeps on ice", createdAt: 1, updatedAt: 10 },
    { id: "h2", bookId: "b2", page: 2, rects: [], color: "blue", style: "underline", text: "a group has one identity", createdAt: 1, updatedAt: 30 },
    { id: "h3", bookId: "gone", page: 1, rects: [], color: "pink", text: "from a removed book", createdAt: 1, updatedAt: 5 },
    { id: "h4", bookId: "b1", page: 6, rects: [], color: "green", text: "", createdAt: 1, updatedAt: 6 },
  ],
  notes: [{ id: "n1", bookId: "b1", page: 2, rects: [], text: "seals haul out", title: "Why?", body: "Ask, \"is it for warmth\"?\nCheck chapter 3.", createdAt: 1, updatedAt: 20 }],
  stickies: [{ id: "s1", bookId: "b2", page: 7, x: 0, y: 0, color: "pink", title: "", text: "Résumé of the proof", collapsed: false, createdAt: 1, updatedAt: 40 }],
  bookmarks: [],
};
const items = notebookItems(all, books);
const everything: NotebookFilter = { kind: "all", bookId: null, tag: null, query: "", sort: "book" };

test("everything marked in every book is one list, without marks of removed books", () => {
  expect(items).toHaveLength(5);
  expect(items.find((i) => i.id === "n1")).toMatchObject({ kind: "note", bookTitle: "Zoology", tags: ["biology"], passage: "seals haul out", note: expect.stringContaining("warmth"), title: "Why?" });
  expect(items.some((i) => i.id === "h3")).toBe(false);
});

test("filters by kind, book, tag and words; sorts by book and page or by newest", () => {
  const ids = (f: Partial<NotebookFilter>) => filterNotebook(items, { ...everything, ...f }).map((i) => i.id);
  expect(ids({})).toEqual(["h2", "s1", "n1", "h1", "h4"]); // Algebra before Zoology, then pages
  expect(ids({ sort: "newest" })).toEqual(["s1", "h2", "n1", "h1", "h4"]);
  expect(ids({ kind: "highlight" })).toEqual(["h2", "h1", "h4"]);
  expect(ids({ bookId: "b1" })).toEqual(["n1", "h1", "h4"]);
  expect(ids({ tag: "exam 2026" })).toEqual(["h2", "s1"]);
  expect(ids({ query: "RESUME proof" })).toEqual(["s1"]);
  expect(ids({ query: "zoology walrus" })).toEqual(["h1"]); // the book's name counts too
  expect(ids({ query: "giraffe" })).toEqual([]);
  expect(byBook(filterNotebook(items, everything)).map((g) => [g.title, g.items.length])).toEqual([["Algebra", 2], ["Zoology", 3]]);
});

test("Markdown has a heading for each book", () => {
  const md = notebookMarkdown(filterNotebook(items, everything));
  expect(md).toContain("# Algebra\n\n- p. 2 “a group has one identity”");
  expect(md).toContain("# Zoology (A. Naturalist)");
  expect(md).toContain("- p. 2: **Why?**\n  > seals haul out\n  Ask, \"is it for warmth\"?\n  Check chapter 3.");
  expect(md).toContain("- p. 6 (marked area)");
});

test("the spreadsheet file quotes what needs quoting", () => {
  const csv = notebookCsv(filterNotebook(items, { ...everything, bookId: "b1" }));
  const rows = csv.replace("﻿", "").trim().split("\r\n");
  expect(rows[0]).toBe("Book,Author,Page,Kind,Color,Title,Passage,Note,Tags,Changed");
  expect(rows).toHaveLength(4); // the heading and three marks (the line break inside the note is not a row end)
  expect(csv).toContain('Zoology,A. Naturalist,2,Note,,Why?,seals haul out,"Ask, ""is it for warmth""?\nCheck chapter 3.",biology,1970-01-01');
  expect(csv.startsWith("﻿")).toBe(true);
});

test("the Anki file has one card for each mark with words, and tags without spaces", () => {
  const lines = notebookAnki(filterNotebook(items, everything)).trim().split("\n");
  expect(lines.slice(0, 4)).toEqual(["#separator:tab", "#html:true", "#columns:Front\tBack\tTags", "#tags column:3"]);
  const cards = lines.slice(4).map((l) => l.split("\t"));
  expect(cards).toHaveLength(4); // the marked area has no words and makes no card
  expect(cards.every((c) => c.length === 3)).toBe(true);
  expect(cards[0]).toEqual(["a group has one identity", "<i>Algebra, p. 2</i>", "Reader343 Algebra math Exam_2026"]);
  const note = cards.find((c) => c[0] === "seals haul out")!;
  expect(note[1]).toBe("Why?<br><br>Ask, \"is it for warmth\"?<br>Check chapter 3.<br><br><i>Zoology, A. Naturalist, p. 2</i>");
  const sticky = cards.find((c) => c[0] === "Résumé of the proof")!;
  expect(sticky[1]).toBe("<i>Algebra, p. 7</i>");
});
