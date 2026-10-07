import { expect, test } from "vitest";
import { allTags, continueReading, filterBooks, parseTags, percentRead, shelfOf } from "../../app/src/library/filters";
import type { Book, Progress } from "../../app/src/db/repos";

const b = (id: string, title: string, extra: Partial<Book> = {}): Book => ({
  id, hash: id, title, author: "Ann Writer", pageCount: 100, fileName: "", fileSize: 0,
  addedAt: 0, lastOpenedAt: null, finishedAt: null, ...extra,
});
const p = (bookId: string, page: number, updatedAt = 0): Progress => ({ bookId, page, offset: 0, updatedAt });

test("shelves", () => {
  expect(shelfOf(b("a", "A"))).toBe("unread");
  expect(shelfOf(b("a", "A"), p("a", 30))).toBe("reading");
  expect(shelfOf(b("a", "A", { finishedAt: 5 }), p("a", 30))).toBe("finished");
});

test("percent read uses the page count", () => {
  expect(percentRead(b("a", "A"), p("a", 50))).toBe(50);
  expect(percentRead(b("a", "A"))).toBe(0);
});

test("search matches title or author, sort by title or recent", () => {
  const books = [b("1", "Zebra"), b("2", "apple", { lastOpenedAt: 5 }), b("3", "Mango", { author: "Zed" })];
  const progress = new Map([["2", p("2", 10)]]);
  expect(filterBooks(books, progress, { shelf: "all", query: "", sort: "title" }).map((x) => x.id)).toEqual(["2", "3", "1"]);
  expect(filterBooks(books, progress, { shelf: "all", query: "zed", sort: "title" }).map((x) => x.id)).toEqual(["3"]);
  expect(filterBooks(books, progress, { shelf: "reading", query: "", sort: "recent" }).map((x) => x.id)).toEqual(["2"]);
});

test("favorites shelf, tag filter, and search that also looks at tags", () => {
  const books = [b("1", "Zebra", { favorite: true, tags: ["Physics", "exam"] }), b("2", "Apple", { tags: ["physics"] }), b("3", "Mango")];
  const none = new Map<string, Progress>();
  const ids = (options: Parameters<typeof filterBooks>[2]) => filterBooks(books, none, options).map((x) => x.id);
  expect(ids({ shelf: "favorites", query: "", sort: "title" })).toEqual(["1"]);
  expect(ids({ shelf: "all", query: "", sort: "title", tag: "physics" })).toEqual(["2", "1"]);
  expect(ids({ shelf: "all", query: "", sort: "title", tag: "exam" })).toEqual(["1"]);
  expect(ids({ shelf: "all", query: "EXAM", sort: "title" })).toEqual(["1"]);
  expect(ids({ shelf: "favorites", query: "", sort: "title", tag: "physics" })).toEqual(["1"]);
});

test("continue reading lists the books in progress, the last one opened first", () => {
  const books = [b("1", "One"), b("2", "Two", { lastOpenedAt: 50 }), b("3", "Three", { finishedAt: 9 }), b("4", "Four"), b("5", "Five")];
  const progress = new Map([["1", p("1", 5, 10)], ["2", p("2", 5, 20)], ["3", p("3", 100, 99)], ["5", p("5", 2, 30)]]);
  expect(continueReading(books, progress).map((x) => x.id)).toEqual(["2", "5", "1"]);
  expect(continueReading(books, progress, 1).map((x) => x.id)).toEqual(["2"]);
  expect(continueReading(books, new Map())).toEqual([]);
});

test("tags are cleaned when typed and listed once for the library", () => {
  expect(parseTags("physics, Exam   2026,, PHYSICS ; to read، قراءة")).toEqual(["physics", "Exam 2026", "to read", "قراءة"]);
  expect(parseTags("")).toEqual([]);
  expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(","))).toHaveLength(12);
  expect(allTags([b("1", "A", { tags: ["zoo", "Physics"] }), b("2", "B", { tags: ["physics", "exam"] }), b("3", "C")])).toEqual(["exam", "Physics", "zoo"]);
});
