// @vitest-environment node
import { beforeEach, expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos, type Book, type Repos } from "../../app/src/db/repos";

let repos: Repos;
let n = 0;
beforeEach(async () => {
  repos = createRepos(await openDb(`test-${n++}`));
});

const book = (id: string, extra: Partial<Book> = {}): Book => ({
  id, hash: `h-${id}`, title: `Book ${id}`, author: "", pageCount: 10, fileName: `${id}.pdf`,
  fileSize: 3, addedAt: 1, lastOpenedAt: null, finishedAt: null, ...extra,
});

test("adds a book with its file and cover, and reads them back", async () => {
  await repos.books.add(book("a"), new Blob(["pdf"]), new Blob(["jpg"]));
  expect((await repos.books.get("a"))?.title).toBe("Book a");
  expect(await (await repos.books.file("a"))!.text()).toBe("pdf");
  expect(await (await repos.books.cover("a"))!.text()).toBe("jpg");
  expect((await repos.books.findByHash("h-a"))?.id).toBe("a");
});

test("update merges fields; remove deletes book, file, cover and progress", async () => {
  await repos.books.add(book("a"), new Blob(["pdf"]), null);
  await repos.progress.save("a", 3, 0.5);
  expect((await repos.books.update("a", { title: "New" })).title).toBe("New");
  await repos.books.remove("a");
  expect(await repos.books.get("a")).toBeUndefined();
  expect(await repos.books.file("a")).toBeUndefined();
  expect(await repos.progress.get("a")).toBeUndefined();
});

test("progress clamps page and offset", async () => {
  const p = await repos.progress.save("a", 0, 1.7);
  expect(p.page).toBe(1);
  expect(p.offset).toBe(1);
});

test("settings return the fallback until set", async () => {
  expect(await repos.settings.get("pageStyle", "dark")).toBe("dark");
  await repos.settings.set("pageStyle", "sepia");
  expect(await repos.settings.get("pageStyle", "dark")).toBe("sepia");
});
