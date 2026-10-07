// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { BookAnnotations } from "../../app/src/db/annotations";
import { openDb } from "../../app/src/db/idb";
import { createRepos, type Book } from "../../app/src/db/repos";
import { searchInsideBooks, searchNotes, snippet } from "../../app/src/library/deepSearch";

test("a snippet shows the found words with some of what is around them", () => {
  expect(snippet("The quick brown fox", "QUICK")).toEqual({ before: "The ", hit: "quick", after: " brown fox" });
  expect(snippet("Un résumé   très\ncourt", "resume tres")).toEqual({ before: "Un ", hit: "résumé très", after: " court" });
  expect(snippet("nothing here", "walrus")).toBeNull();
  expect(snippet("anything", "  ")).toBeNull();
  const long = `${"a ".repeat(60)}needle${" b".repeat(60)}`;
  const found = snippet(long, "needle", 20)!;
  expect(found.before.startsWith("…")).toBe(true);
  expect(found.after.endsWith("…")).toBe(true);
  expect(found.hit).toBe("needle");
});

const stamp = { createdAt: 1, updatedAt: 1 };
const marks: BookAnnotations = {
  highlights: [{ id: "h1", bookId: "b1", page: 3, rects: [], color: "yellow", text: "the walrus sleeps on ice", ...stamp }],
  notes: [
    { id: "n1", bookId: "b1", page: 5, rects: [], text: "quoted passage", body: "ask about the WALRUS", title: "Question", ...stamp },
    { id: "n2", bookId: "b2", page: 1, rects: [], text: "a passage about seals", body: "", ...stamp },
  ],
  stickies: [{ id: "s1", bookId: "b2", page: 9, x: 0, y: 0, color: "pink", text: "buy milk", title: "Walrus facts", collapsed: false, ...stamp }],
  bookmarks: [],
};

test("looks in notes, sticky notes and highlights of every book", () => {
  const hits = searchNotes(marks, "walrus");
  expect(hits.map((h) => [h.kind, h.bookId, h.page, h.hit])).toEqual([
    ["note", "b1", 5, "WALRUS"],
    ["sticky", "b2", 9, "Walrus"],
    ["highlight", "b1", 3, "walrus"],
  ]);
  expect(searchNotes(marks, "seals").map((h) => h.id)).toEqual(["n2"]); // the passage a note is on counts too
  expect(searchNotes(marks, "giraffe")).toEqual([]);
  expect(searchNotes(marks, "walrus", 2)).toHaveLength(2);
});

test("looks inside the text of every book and passes over one that cannot be opened", async () => {
  const repos = createRepos(await openDb("deep-search"));
  const book = (id: string, title: string, extra: Partial<Book> = {}): Book => ({
    id, hash: id, title, author: "", pageCount: 2, fileName: `${id}.pdf`, fileSize: 1, addedAt: 0, lastOpenedAt: null, finishedAt: null, ...extra,
  });
  const pdf = (path: string) => new Blob([readFileSync(path)], { type: "application/pdf" });
  await repos.books.add(book("sample", "Sample"), pdf("src/sample/sample.pdf"), null);
  await repos.books.add(book("links", "Links"), pdf("test/fixtures/links.pdf"), null);
  await repos.books.add(book("locked", "Locked, password lost"), pdf("test/fixtures/locked.pdf"), null);
  await repos.books.add(book("open", "Locked, password kept", { password: "open sesame" }), pdf("test/fixtures/locked.pdf"), null);
  const books = await repos.books.all();
  const steps: number[] = [];
  const found = await searchInsideBooks(repos, books, "glossary", (_, done) => steps.push(done), { now: false });
  expect(found.map((f) => [f.book.id, f.count])).toEqual([["links", 2]]);
  expect(found[0].first.map((m) => m.page)).toEqual([1, 2]);
  expect(found[0].first[0].hit).toBe("glossary");
  expect(found[0].first[0].before.endsWith("Open the ")).toBe(true);
  expect(steps.at(-1)).toBe(books.length);

  // Stopped before it starts: nothing is opened.
  expect(await searchInsideBooks(repos, books, "glossary", () => {}, { now: true })).toEqual([]);
});
