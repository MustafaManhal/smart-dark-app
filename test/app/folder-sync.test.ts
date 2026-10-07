// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos, type Book, type Repos } from "../../app/src/db/repos";
import { syncFolder, type SyncFolder } from "../../app/src/sync/folderSync";

const pdf = () => new Blob([readFileSync("src/sample/sample.pdf")], { type: "application/pdf" });
const book = (id: string, hash: string, title: string): Book => ({
  id, hash, title, author: "A", pageCount: 2, fileName: `${title}.pdf`, fileSize: 10, addedAt: 1, lastOpenedAt: null, finishedAt: null,
});

/** A folder kept in memory, standing in for the one both computers see. */
function memoryFolder() {
  const files = new Map<string, Uint8Array>();
  const folder: SyncFolder = {
    list: async (dir) => [...files.keys()].filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)),
    read: async (path) => files.get(path) ?? null,
    write: async (path, data) => void files.set(path, data),
  };
  return { files, folder };
}

/** A computer: its library, and what it remembers between rounds of sync. */
async function computer(name: string, folder: SyncFolder) {
  const repos = createRepos(await openDb(`sync-${name}-${Math.random()}`));
  let memory = { device: name, known: [] as string[], deleted: {} as Record<string, number> };
  let clock = 1000;
  const sync = async (at?: number) => {
    clock = at ?? clock + 1000;
    const done = await syncFolder(repos, folder, memory, { now: () => clock });
    memory = { device: name, known: done.known, deleted: done.deleted };
    return done.summary;
  };
  return { repos, sync };
}

const titles = async (repos: Repos) => (await repos.books.all()).map((b) => b.title).sort();

test("a book and its marks travel from one computer to another", async () => {
  const { files, folder } = memoryFolder();
  const a = await computer("a", folder), b = await computer("b", folder);
  await a.repos.books.add(book("b1", "hash-1", "Sample"), pdf(), new Blob(["jpeg"], { type: "image/jpeg" }));
  await a.repos.books.update("b1", { password: "secret", favorite: true });
  await a.repos.progress.save("b1", 2, 0.5);
  await a.repos.annotations.putHighlight({ id: "h1", bookId: "b1", page: 1, rects: [], color: "blue", text: "quote" });
  await a.repos.annotations.toggleBookmark("b1", 2);
  await a.repos.drawings.put({ id: "d1", bookId: "b1", page: 1, tool: "line", color: "ink", size: 0.004, points: [0, 0, 1, 1] });
  await a.repos.sessions.save({ id: "x1", bookId: "b1", start: 10, end: 70_010, activeMs: 70_000, pages: [1, 2] });

  expect(await a.sync()).toMatchObject({ booksSent: 1, booksAdded: 0, devices: 0 });
  expect([...files.keys()].sort()).toEqual(["books/hash-1.pdf", "covers/hash-1", "state/a.json"]);
  // The password of a protected book stays on its computer.
  expect(new TextDecoder().decode(files.get("state/a.json"))).not.toContain("secret");

  expect(await b.sync()).toMatchObject({ booksAdded: 1, received: 3, devices: 1, booksSent: 0 });
  expect(await titles(b.repos)).toEqual(["Sample"]);
  const got = (await b.repos.books.all())[0];
  expect(got).toMatchObject({ hash: "hash-1", favorite: true });
  expect(got.password).toBeUndefined();
  expect((await b.repos.books.file(got.id))!.size).toBe(pdf().size);
  expect((await b.repos.books.cover(got.id))!.type).toBe("image/jpeg");
  expect(await b.repos.progress.get(got.id)).toMatchObject({ page: 2, offset: 0.5 });
  const marks = await b.repos.annotations.listForBook(got.id);
  expect(marks.highlights.map((h) => h.text)).toEqual(["quote"]);
  expect(marks.bookmarks.map((m) => m.page)).toEqual([2]);
  expect((await b.repos.drawings.all()).map((d) => d.id)).toEqual(["d1"]);
  expect((await b.repos.sessions.all()).map((x) => x.id)).toEqual(["x1"]);

  // Nothing new: another round changes nothing, on either side.
  expect(await a.sync()).toMatchObject({ booksAdded: 0, received: 0, removed: 0, booksSent: 0, devices: 1 });
  expect(await b.sync()).toMatchObject({ booksAdded: 0, received: 0, removed: 0, booksSent: 0 });
});

test("the same book added on both computers is one book, and the newer change of a mark wins", async () => {
  const { folder } = memoryFolder();
  const a = await computer("a", folder), b = await computer("b", folder);
  // Each computer added the file itself: the ids differ, the content is the same.
  await a.repos.books.add(book("on-a", "hash-1", "Sample"), pdf(), null);
  await b.repos.books.add(book("on-b", "hash-1", "Sample"), pdf(), null);
  await a.repos.annotations.putNote({ id: "n1", bookId: "on-a", page: 1, rects: [], text: "q", body: "first words" });
  await a.sync();
  await b.sync();
  expect(await titles(b.repos)).toEqual(["Sample"]);
  expect((await b.repos.annotations.listForBook("on-b")).notes.map((n) => n.body)).toEqual(["first words"]);

  // B rewrites the note, A reads further: each change reaches the other side.
  await new Promise((r) => setTimeout(r, 5));
  await b.repos.annotations.putNote({ ...(await b.repos.annotations.listForBook("on-b")).notes[0], body: "better words" });
  await a.repos.progress.save("on-a", 2, 0.75);
  await a.repos.books.update("on-a", { tags: ["work"] });
  await b.sync();
  expect(await a.sync()).toMatchObject({ received: 1 });
  expect((await a.repos.annotations.listForBook("on-a")).notes.map((n) => n.body)).toEqual(["better words"]);
  await b.sync();
  expect(await b.repos.progress.get("on-b")).toMatchObject({ page: 2, offset: 0.75 });
  expect((await b.repos.books.get("on-b"))!.tags).toEqual(["work"]);
  // The older copy of the note, still in A's earlier file, did not come back.
  expect((await b.repos.annotations.listForBook("on-b")).notes.map((n) => n.body)).toEqual(["better words"]);
});

test("what is removed on one computer is removed on the other, and does not come back", async () => {
  const { folder } = memoryFolder();
  const a = await computer("a", folder), b = await computer("b", folder), c = await computer("c", folder);
  await a.repos.books.add(book("b1", "hash-1", "Keep"), pdf(), null);
  await a.repos.books.add(book("b2", "hash-2", "Drop"), pdf(), null);
  await a.repos.annotations.putHighlight({ id: "h1", bookId: "b1", page: 1, rects: [], color: "blue", text: "stays" });
  await a.repos.annotations.putHighlight({ id: "h2", bookId: "b1", page: 1, rects: [], color: "pink", text: "goes" });
  await a.repos.annotations.toggleBookmark("b1", 1);
  await a.repos.drawings.put({ id: "d1", bookId: "b1", page: 1, tool: "line", color: "ink", size: 0.004, points: [0, 0, 1, 1] });
  await a.sync();
  await b.sync();
  await c.sync();
  expect(await titles(c.repos)).toEqual(["Drop", "Keep"]);

  await new Promise((r) => setTimeout(r, 5));
  const later = Date.now() + 10;
  await b.repos.annotations.remove("highlights", "h2");
  await b.repos.annotations.toggleBookmark("b1", 1);
  await b.repos.drawings.remove("d1");
  await b.repos.books.remove("b2");
  await b.sync(later);
  expect(await a.sync(later + 1)).toMatchObject({ removed: 4 });
  expect(await titles(a.repos)).toEqual(["Keep"]);
  const marks = await a.repos.annotations.listForBook("b1");
  expect(marks.highlights.map((h) => h.text)).toEqual(["stays"]);
  expect(marks.bookmarks).toEqual([]);
  expect(await a.repos.drawings.all()).toEqual([]);

  // C still has everything in its own file. Its round takes the removals, and its old copy revives nothing.
  expect(await c.sync(later + 2)).toMatchObject({ removed: 4, booksAdded: 0 });
  expect(await titles(c.repos)).toEqual(["Keep"]);
  expect(await b.sync(later + 3)).toMatchObject({ booksAdded: 0, received: 0 });
  expect(await a.sync(later + 4)).toMatchObject({ booksAdded: 0, received: 0 });
  expect(await titles(b.repos)).toEqual(["Keep"]);

  // A mark changed after it was removed elsewhere is kept: the newer act wins.
  await a.repos.annotations.putHighlight({ ...(await a.repos.annotations.listForBook("b1")).highlights[0], text: "stays, edited" });
  const edited = Date.now();
  await b.repos.annotations.remove("highlights", "h1");
  await b.sync(edited - 1000); // B's clock says it removed the mark before A edited it
  await a.sync(edited + 10);
  expect((await a.repos.annotations.listForBook("b1")).highlights.map((h) => h.text)).toEqual(["stays, edited"]);
  await b.sync(edited + 20);
  expect((await b.repos.annotations.listForBook("b1")).highlights.map((h) => h.text)).toEqual(["stays, edited"]);
});

test("a book whose file has not arrived yet waits, and a broken state file is passed over", async () => {
  const { files, folder } = memoryFolder();
  const a = await computer("a", folder), b = await computer("b", folder);
  await a.repos.books.add(book("b1", "hash-1", "Sample"), pdf(), null);
  await a.repos.annotations.putHighlight({ id: "h1", bookId: "b1", page: 1, rects: [], color: "blue", text: "quote" });
  await a.sync();
  // The cloud brought the small state file first; the PDF is still on its way.
  const held = files.get("books/hash-1.pdf")!;
  files.delete("books/hash-1.pdf");
  files.set("state/a (conflicted copy).json", new TextEncoder().encode("{ not json"));
  files.set("state/notes.txt", new TextEncoder().encode("hello"));
  expect(await b.sync()).toMatchObject({ booksAdded: 0, received: 0, waiting: 1, devices: 1 });
  expect(await titles(b.repos)).toEqual([]);
  files.set("books/hash-1.pdf", held);
  expect(await b.sync()).toMatchObject({ booksAdded: 1, received: 1, waiting: 0 });
});
