// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { flattenOutline, openPdf, readBookInfo, resolveDest } from "../../app/src/reader/pdf";

const sample = () => new Uint8Array(readFileSync("src/sample/sample.pdf"));

test("reads title and page count", async () => {
  const doc = await openPdf(sample());
  expect(await readBookInfo(doc, "sample.pdf")).toEqual({ title: "Reader343 sample", author: "", pageCount: 2 });
});

test("flattens the outline with 1-based pages", async () => {
  const doc = await openPdf(sample());
  expect(await flattenOutline(doc)).toEqual([
    { title: "Quarterly report", page: 1, depth: 0 },
    { title: "Page two", page: 2, depth: 0 },
  ]);
});

test("falls back to the file name when the PDF has no title", async () => {
  const untitled = { numPages: 3, getMetadata: async () => ({ info: { Title: "  " } }) };
  const info = await readBookInfo(untitled as never, "attention-paper.pdf");
  expect(info).toEqual({ title: "attention-paper", author: "", pageCount: 3 });
});

test("a destination gives its page and how far down the page it is", async () => {
  const doc = await openPdf(new Uint8Array(readFileSync("test/fixtures/links.pdf")));
  const links = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === "Link");
  // [page 3, 520pt from the bottom of an 842pt page]
  const results = await resolveDest(doc, links[0].dest);
  expect(results?.page).toBe(3);
  expect(results?.top).toBeCloseTo(1 - 520 / 842, 3);
  // a named place, fitted to the width at 420pt
  const glossary = await resolveDest(doc, "glossary");
  expect(glossary?.page).toBe(2);
  expect(glossary?.top).toBeCloseTo(1 - 420 / 842, 3);
  // a whole-page destination has no place on the page
  expect(await resolveDest(doc, links[2].dest)).toEqual({ page: 2, top: null });
  expect(await resolveDest(doc, "no such place")).toBeNull();
  expect(await resolveDest(doc, [99, { name: "Fit" }])).toBeNull();
});
