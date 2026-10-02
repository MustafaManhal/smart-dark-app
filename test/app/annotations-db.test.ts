// @vitest-environment node
import { expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos } from "../../app/src/db/repos";
import type { Book } from "../../app/src/db/repos";

const book = (id: string): Book => ({
  id, hash: `h-${id}`, title: id, author: "", pageCount: 5, fileName: `${id}.pdf`, fileSize: 1,
  addedAt: 1, lastOpenedAt: null, finishedAt: null,
});

test("upgrading a version 1 database keeps books and adds annotation stores", async () => {
  // Build a v1 database by hand, the way version 1 of the app created it.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("upgrade-test", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("books", { keyPath: "id" }).createIndex("hash", "hash", { unique: true });
      for (const s of ["files", "covers", "settings"]) db.createObjectStore(s);
      db.createObjectStore("progress", { keyPath: "bookId" });
      req.transaction!.objectStore("books").put(book("old"));
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const repos = createRepos(await openDb("upgrade-test"));
  expect((await repos.books.get("old"))?.title).toBe("old");
  expect(await repos.annotations.listForBook("old")).toEqual({ highlights: [], notes: [], stickies: [], bookmarks: [] });
});

test("highlights, sticky notes and bookmarks round-trip; removing the book removes them", async () => {
  const repos = createRepos(await openDb("annot-test"));
  await repos.books.add(book("b"), new Blob(["x"]), null);
  const h = await repos.annotations.putHighlight({ bookId: "b", page: 2, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }], color: "yellow", text: "hello" });
  const s = await repos.annotations.putSticky({ bookId: "b", page: 1, x: 0.5, y: 0.5, color: "yellow", text: "remember", collapsed: false });
  expect(await repos.annotations.toggleBookmark("b", 3)).toBe(true);
  let all = await repos.annotations.listForBook("b");
  expect(all.highlights[0]).toMatchObject({ id: h.id, text: "hello" });
  expect(all.stickies[0]).toMatchObject({ id: s.id, text: "remember" });
  expect(all.bookmarks.map((b) => b.page)).toEqual([3]);

  const edited = await repos.annotations.putHighlight({ ...h, color: "green" });
  expect(edited.id).toBe(h.id);
  expect(edited.updatedAt).toBeGreaterThanOrEqual(h.updatedAt);
  expect(await repos.annotations.toggleBookmark("b", 3)).toBe(false);

  await repos.annotations.remove("stickies", s.id);
  all = await repos.annotations.listForBook("b");
  expect(all).toMatchObject({ stickies: [], bookmarks: [] });
  expect(all.highlights[0].color).toBe("green");

  await repos.books.remove("b");
  expect(await repos.annotations.listForBook("b")).toEqual({ highlights: [], notes: [], stickies: [], bookmarks: [] });
});

test("version 3 moves notes written on highlights into separate passage notes", async () => {
  // A v2 database with one highlight that carries a note and one without.
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("upgrade-v3", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("books", { keyPath: "id" }).createIndex("hash", "hash", { unique: true });
      for (const s of ["files", "covers", "settings"]) db.createObjectStore(s);
      db.createObjectStore("progress", { keyPath: "bookId" });
      for (const s of ["highlights", "stickies", "bookmarks"]) db.createObjectStore(s, { keyPath: "id" }).createIndex("bookId", "bookId");
      const hl = req.transaction!.objectStore("highlights");
      const base = { bookId: "b", page: 1, rects: [{ x: 0, y: 0, w: 0.1, h: 0.01 }], color: "yellow", createdAt: 1, updatedAt: 1 };
      hl.put({ ...base, id: "with-note", text: "quoted", note: "my thought" });
      hl.put({ ...base, id: "plain", text: "other", note: "" });
    };
    req.onsuccess = () => { req.result.close(); resolve(); };
    req.onerror = () => reject(req.error);
  });
  const repos = createRepos(await openDb("upgrade-v3"));
  const all = await repos.annotations.listForBook("b");
  expect(all.highlights.map((h) => h.id).sort()).toEqual(["plain", "with-note"]);
  expect(all.highlights.every((h) => !("note" in h))).toBe(true);
  expect(all.notes).toHaveLength(1);
  expect(all.notes[0]).toMatchObject({ page: 1, text: "quoted", body: "my thought" });
});

test("passage notes are separate from highlights", async () => {
  const repos = createRepos(await openDb("notes-test"));
  const n = await repos.annotations.putNote({ bookId: "b", page: 4, rects: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.02 }], text: "a passage", body: "why this matters" });
  const all = await repos.annotations.listForBook("b");
  expect(all.highlights).toEqual([]);
  expect(all.notes[0]).toMatchObject({ id: n.id, body: "why this matters" });
  await repos.annotations.remove("notes", n.id);
  expect((await repos.annotations.listForBook("b")).notes).toEqual([]);
});
