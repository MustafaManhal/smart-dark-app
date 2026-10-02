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
  expect(await repos.annotations.listForBook("old")).toEqual({ highlights: [], stickies: [], bookmarks: [] });
});

test("highlights, sticky notes and bookmarks round-trip; removing the book removes them", async () => {
  const repos = createRepos(await openDb("annot-test"));
  await repos.books.add(book("b"), new Blob(["x"]), null);
  const h = await repos.annotations.putHighlight({ bookId: "b", page: 2, rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.02 }], color: "yellow", text: "hello", note: "" });
  const s = await repos.annotations.putSticky({ bookId: "b", page: 1, x: 0.5, y: 0.5, color: "yellow", text: "remember", collapsed: false });
  expect(await repos.annotations.toggleBookmark("b", 3)).toBe(true);
  let all = await repos.annotations.listForBook("b");
  expect(all.highlights[0]).toMatchObject({ id: h.id, text: "hello" });
  expect(all.stickies[0]).toMatchObject({ id: s.id, text: "remember" });
  expect(all.bookmarks.map((b) => b.page)).toEqual([3]);

  const edited = await repos.annotations.putHighlight({ ...h, note: "my note" });
  expect(edited.id).toBe(h.id);
  expect(edited.updatedAt).toBeGreaterThanOrEqual(h.updatedAt);
  expect(await repos.annotations.toggleBookmark("b", 3)).toBe(false);

  await repos.annotations.remove("stickies", s.id);
  all = await repos.annotations.listForBook("b");
  expect(all).toMatchObject({ stickies: [], bookmarks: [] });
  expect(all.highlights[0].note).toBe("my note");

  await repos.books.remove("b");
  expect(await repos.annotations.listForBook("b")).toEqual({ highlights: [], stickies: [], bookmarks: [] });
});
