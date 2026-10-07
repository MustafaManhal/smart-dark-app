// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos } from "../../app/src/db/repos";
import { importPdf, ImportError } from "../../app/src/library/importer";

const sampleFile = () => new File([readFileSync("src/sample/sample.pdf")], "sample.pdf", { type: "application/pdf" });

test("imports a PDF once and reports duplicates", async () => {
  const { books } = createRepos(await openDb("import-test"));
  const deps = { books, makeCover: async () => new Blob(["jpg"]), now: () => 42, newId: () => "id-1" };
  const first = await importPdf(sampleFile(), deps);
  expect(first).toMatchObject({ duplicate: false, book: { id: "id-1", title: "Smart Dark PDF sample", pageCount: 2, addedAt: 42 } });
  expect((await books.file("id-1"))?.size).toBe(sampleFile().size);
  const second = await importPdf(sampleFile(), { ...deps, newId: () => "id-2" });
  expect(second).toMatchObject({ duplicate: true, book: { id: "id-1" } });
});

test("rejects files that are not PDFs", async () => {
  const { books } = createRepos(await openDb("import-test-2"));
  const bad = new File(["hello"], "notes.txt", { type: "text/plain" });
  await expect(importPdf(bad, { books, makeCover: async () => null })).rejects.toMatchObject({ code: "not-pdf" });
  const broken = new File(["%PDF-1.7 garbage"], "broken.pdf", { type: "application/pdf" });
  await expect(importPdf(broken, { books, makeCover: async () => null })).rejects.toBeInstanceOf(ImportError);
});

test("a protected PDF asks for its password and keeps the right one", async () => {
  const { books } = createRepos(await openDb("import-test-3"));
  const locked = () => new File([readFileSync("test/fixtures/locked.pdf")], "locked.pdf", { type: "application/pdf" });
  const deps = { books, makeCover: async () => null, newId: () => "locked-1" };
  await expect(importPdf(locked(), deps)).rejects.toMatchObject({ code: "password" });
  await expect(importPdf(locked(), deps, "wrong")).rejects.toMatchObject({ code: "wrong-password" });
  expect(await books.all()).toHaveLength(0);
  const { book } = await importPdf(locked(), deps, "open sesame");
  expect(book).toMatchObject({ id: "locked-1", pageCount: 2, password: "open sesame" });
  expect((await books.get("locked-1"))?.password).toBe("open sesame");
});
