// @vitest-environment node
import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "vitest";
import { createBackup, restoreBackup } from "../../app/src/backup/backup";
import { openDb } from "../../app/src/db/idb";
import { createRepos, type Book } from "../../app/src/db/repos";

const book: Book = {
  id: "b1", hash: "hash-1", title: "Sample", author: "A", pageCount: 2, fileName: "sample.pdf", fileSize: 10,
  addedAt: 1, lastOpenedAt: 2, finishedAt: null,
};

async function seeded(name: string) {
  const repos = createRepos(await openDb(name));
  await repos.books.add(book, new Blob([readFileSync("src/sample/sample.pdf")], { type: "application/pdf" }), new Blob(["jpeg"], { type: "image/jpeg" }));
  await repos.progress.save("b1", 2, 0.25);
  await repos.annotations.putHighlight({ id: "h1", bookId: "b1", page: 1, rects: [], color: "blue", text: "quote" });
  await repos.annotations.putNote({ id: "n1", bookId: "b1", page: 1, rects: [], text: "q", body: "note body" });
  await repos.annotations.putSticky({ id: "s1", bookId: "b1", page: 2, x: 0.1, y: 0.2, color: "pink", text: "sticky", collapsed: false });
  await repos.annotations.toggleBookmark("b1", 2);
  await repos.settings.set("pageStyle", "sepia");
  await repos.sessions.save({ id: "x1", bookId: "b1", start: 10, end: 70_010, activeMs: 70_000, pages: [1, 2] });
  return repos;
}

test("a backup restores everything into an empty library", async () => {
  const source = await seeded("backup-src");
  const zip = await createBackup(source, { now: () => 1000 });
  expect(zip.name).toMatch(/^reader343-backup-.*\.zip$/);

  const target = createRepos(await openDb("backup-dst"));
  const summary = await restoreBackup(target, new Uint8Array(await zip.arrayBuffer()));
  expect(summary).toEqual({ booksAdded: 1, booksAlreadyThere: 0, annotationsAdded: 4 });

  expect(await target.books.get("b1")).toEqual(book);
  expect((await target.books.file("b1"))!.size).toBe((await source.books.file("b1"))!.size);
  expect(await (await target.books.cover("b1"))!.text()).toBe("jpeg");
  expect(await target.progress.get("b1")).toMatchObject({ page: 2, offset: 0.25 });
  const a = await target.annotations.listForBook("b1");
  expect([a.highlights.length, a.notes.length, a.stickies.length, a.bookmarks.length]).toEqual([1, 1, 1, 1]);
  expect(a.notes[0].body).toBe("note body");
  expect(await target.settings.get("pageStyle", "dark")).toBe("sepia");
  expect(await target.sessions.all()).toEqual([{ id: "x1", bookId: "b1", start: 10, end: 70_010, activeMs: 70_000, pages: [1, 2] }]);
});

test("restoring into a library that has the book keeps it and merges new annotations", async () => {
  const source = await seeded("backup-merge-src");
  const zip = new Uint8Array(await (await createBackup(source)).arrayBuffer());
  const target = await seeded("backup-merge-dst");
  await target.annotations.remove("highlights", "h1");
  const summary = await restoreBackup(target, zip);
  expect(summary).toEqual({ booksAdded: 0, booksAlreadyThere: 1, annotationsAdded: 1 });
  expect((await target.annotations.listForBook("b1")).highlights).toHaveLength(1);
});

test("rejects files that are not backups", async () => {
  const target = createRepos(await openDb("backup-bad"));
  await expect(restoreBackup(target, new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a Reader343 backup/);
});

test("the password of a protected book stays out of the backup", async () => {
  const source = createRepos(await openDb("backup-password"));
  await source.books.add({ ...book, password: "open sesame" }, new Blob([readFileSync("test/fixtures/locked.pdf")], { type: "application/pdf" }), null);
  const zip = await createBackup(source, { now: () => 1000 });
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const manifest = strFromU8(unzipSync(bytes, { filter: (file) => file.name.endsWith(".json") })["backup.json"]);
  expect(manifest).toContain('"title":"Sample"');
  expect(manifest).not.toContain("open sesame");
  const target = createRepos(await openDb("backup-password-dst"));
  await restoreBackup(target, bytes);
  const restored = await target.books.get("b1");
  expect(restored?.title).toBe("Sample");
  expect(restored?.password).toBeUndefined();
});
