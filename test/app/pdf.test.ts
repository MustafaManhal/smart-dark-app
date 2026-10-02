// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { flattenOutline, openPdf, readBookInfo } from "../../app/src/reader/pdf";

const sample = () => new Uint8Array(readFileSync("src/sample/sample.pdf"));

test("reads title and page count", async () => {
  const doc = await openPdf(sample());
  expect(await readBookInfo(doc, "sample.pdf")).toEqual({ title: "Smart Dark PDF sample", author: "", pageCount: 2 });
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
