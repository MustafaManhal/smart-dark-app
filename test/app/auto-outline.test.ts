// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { headingsFromPages, makeOutline, type PageLine } from "../../app/src/reader/autoOutline";
import { openPdf } from "../../app/src/reader/pdf";

const body = (y: number): PageLine => ({ text: "Plain body text that fills the line from one margin to the other.", size: 11, y });
const page = (n: number, lines: PageLine[]) => ({
  page: n, lines: [{ text: "My Book", size: 9, y: 0.05 }, ...lines, { text: String(n), size: 9, y: 0.95 }],
});

test("larger lines become headings, with levels by size; headers and page numbers do not", () => {
  const outline = headingsFromPages([
    page(1, [{ text: "My Book", size: 26, y: 0.1 }, { text: "1 Beginnings", size: 18, y: 0.2 }, body(0.3), { text: "1.1 A first step", size: 14, y: 0.5 }, body(0.6)]),
    page(2, [body(0.2), body(0.3), { text: "1.2 A second step", size: 14, y: 0.5 }]),
    page(3, [{ text: "2 Endings", size: 18, y: 0.15 }, body(0.3), { text: "42", size: 18, y: 0.5 }]),
  ]);
  expect(outline).toEqual([
    { title: "1 Beginnings", page: 1, depth: 0 },
    { title: "1.1 A first step", page: 1, depth: 1 },
    { title: "1.2 A second step", page: 2, depth: 1 },
    { title: "2 Endings", page: 3, depth: 0 },
  ]);
});

test("a book set in one size has no headings to find", () => {
  expect(headingsFromPages([page(1, [body(0.2), body(0.3)]), page(2, [body(0.2)])])).toEqual([]);
  expect(headingsFromPages([])).toEqual([]);
});

test("reads the headings of a real PDF that has no contents of its own", async () => {
  const doc = await openPdf(new Uint8Array(readFileSync("test/fixtures/headings.pdf")));
  expect(await doc.getOutline()).toBeNull();
  expect(await makeOutline(doc)).toEqual([
    { title: "1 Why the sea moves", page: 1, depth: 0 },
    { title: "1.1 The pull of the moon", page: 1, depth: 1 },
    { title: "1.2 Spring and neap tides", page: 2, depth: 1 },
    { title: "2 Reading a tide table", page: 3, depth: 0 },
    { title: "2.1 High and low water", page: 3, depth: 1 },
  ]);
  expect(await makeOutline(doc, { now: true })).toBeNull();
});
