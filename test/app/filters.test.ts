import { expect, test } from "vitest";
import { filterBooks, percentRead, shelfOf } from "../../app/src/library/filters";
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
