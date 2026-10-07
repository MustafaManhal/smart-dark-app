// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { exportAnnotatedPdf, exportCount } from "../../app/src/annotations/exportPdf";
import type { BookAnnotations } from "../../app/src/db/annotations";
import { openPdf } from "../../app/src/reader/pdf";

const stamp = { createdAt: 1, updatedAt: 1 };
const marks: BookAnnotations = {
  highlights: [
    { id: "h1", bookId: "b", page: 1, color: "yellow", text: "two lines", rects: [{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 }, { x: 0.1, y: 0.23, w: 0.3, h: 0.02 }], ...stamp },
    { id: "h2", bookId: "b", page: 1, color: "green", text: "under", style: "underline", rects: [{ x: 0.2, y: 0.5, w: 0.2, h: 0.02 }], ...stamp },
    { id: "h3", bookId: "b", page: 2, color: "pink", text: "struck", style: "strike", rects: [{ x: 0.3, y: 0.1, w: 0.2, h: 0.02 }], ...stamp },
    { id: "h4", bookId: "b", page: 2, color: "blue", text: "", rects: [{ x: 0.5, y: 0.5, w: 0.3, h: 0.2 }], ...stamp }, // an area
  ],
  notes: [{ id: "n1", bookId: "b", page: 1, text: "passage", title: "Question", body: "Why is this ‘so’? ملاحظة", rects: [{ x: 0.1, y: 0.7, w: 0.4, h: 0.02 }], ...stamp }],
  stickies: [{ id: "s1", bookId: "b", page: 2, x: 0.25, y: 0.75, color: "purple", title: "", text: "Remember this", collapsed: false, ...stamp }],
  bookmarks: [{ id: "k1", bookId: "b", page: 1, createdAt: 1 }],
};

test("the exported PDF carries every mark as a standard annotation at its place", async () => {
  const source = new Uint8Array(readFileSync("src/sample/sample.pdf"));
  const out = await exportAnnotatedPdf(source, marks);
  expect(exportCount(marks)).toBe(6);
  expect(new TextDecoder("latin1").decode(out.subarray(0, 5))).toBe("%PDF-");

  const doc = await openPdf(out);
  expect(doc.numPages).toBe(2);
  const first = (await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype !== "Link");
  const second = (await (await doc.getPage(2)).getAnnotations()).filter((a) => a.subtype !== "Link");
  expect(first.map((a) => a.subtype).sort()).toEqual(["Highlight", "Highlight", "Underline"]);
  expect(second.map((a) => a.subtype).sort()).toEqual(["Highlight", "StrikeOut", "Text"]);

  // The sample page is 595 by 842 points. A mark 10% in and 20% down starts at x 59.5, with its top at 842 * 0.8.
  const two = first.find((a) => a.subtype === "Highlight" && a.quadPoints?.length === 16)!;
  expect(two.rect[0]).toBeCloseTo(59.5, 1);
  expect(two.rect[3]).toBeCloseTo(842 * 0.8, 1);
  expect(two.rect[2]).toBeCloseTo(595 * 0.6, 1);
  expect(two.rect[1]).toBeCloseTo(842 * (1 - 0.25), 1);
  expect(two.hasAppearance).toBe(true); // it brings its own drawing
  expect([...two.color]).toEqual([255, 212, 59]);

  // The note's words travel as the comment of its highlight, in any language.
  const note = first.find((a) => a.contentsObj?.str)!;
  expect(note.contentsObj.str).toBe("Question\n\nWhy is this ‘so’? ملاحظة");
  expect(note.titleObj.str).toBe("Reader343");

  // The sticky note is a comment icon where the note is: 25% in, 75% down.
  const sticky = second.find((a) => a.subtype === "Text")!;
  expect(sticky.contentsObj.str).toBe("Remember this");
  expect(sticky.rect[0]).toBeCloseTo(595 * 0.25, 1);
  expect(sticky.rect[3]).toBeCloseTo(842 * 0.25, 1);
});

test("a book without marks exports as itself, and the link it had is still there", async () => {
  const source = new Uint8Array(readFileSync("src/sample/sample.pdf"));
  const out = await exportAnnotatedPdf(source, { highlights: [], notes: [], stickies: [], bookmarks: [] });
  const doc = await openPdf(out);
  const annots = await (await doc.getPage(1)).getAnnotations();
  expect(annots.map((a) => a.subtype)).toEqual(["Link"]);
  expect((await doc.getMetadata()).info).toMatchObject({ Title: "Reader343 sample" });
});

test("a protected PDF is exported with its password", async () => {
  const source = new Uint8Array(readFileSync("test/fixtures/locked.pdf"));
  await expect(exportAnnotatedPdf(source, marks)).rejects.toThrow();
  const out = await exportAnnotatedPdf(source, { ...marks, highlights: marks.highlights.slice(0, 1), notes: [], stickies: [] }, "open sesame");
  const doc = await openPdf(out); // opens without a password
  expect(doc.numPages).toBe(2);
  expect((await (await doc.getPage(1)).getAnnotations()).filter((a) => a.subtype === "Highlight")).toHaveLength(1);
});
