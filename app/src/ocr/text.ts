/**
 * Text that was recognized on a scanned page, and how it becomes the text of
 * that page for everything else (selection, search, read aloud).
 */

/** One recognized line: its words and where it is, in fractions of the page as it is shown upright. */
export type OcrLine = { text: string; x: number; y: number; w: number; h: number };
export type OcrPage = { id: string; bookId: string; page: number; lang: string; lines: OcrLine[] };

type Matrix = [number, number, number, number, number, number];
const multiply = (m: number[], n: number[]): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const invert = (m: number[]): Matrix => {
  const d = m[0] * m[3] - m[1] * m[2];
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
};

const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
export const OCR_FONT = "g_ocr";

/**
 * The recognized lines as pdf.js text content, for a page whose viewport (at
 * scale 1) is given. Each line becomes one text item that sits where the line
 * is in the picture, so the text layer lays selectable words over it.
 */
export function toTextContent(ocr: OcrPage, viewport: { width: number; height: number; transform: number[] }) {
  const toPdf = invert(viewport.transform);
  const items = ocr.lines.filter((line) => line.text.trim()).map((line) => {
    const height = line.h * viewport.height;
    // Letters fill about four fifths of the line's box, and stand on a line one fifth above its foot.
    const size = height * 0.8;
    const left = line.x * viewport.width;
    const base = (line.y + line.h) * viewport.height - height * 0.2;
    // Upright text in the picture is [size, 0, 0, -size] at its place; the page's own matrix is taken out of it.
    const transform = multiply(toPdf, [size, 0, 0, -size, left, base]);
    return {
      str: line.text, dir: RTL.test(line.text) ? "rtl" : "ltr", transform,
      width: line.w * viewport.width, height: size, fontName: OCR_FONT, hasEOL: true,
    };
  });
  return {
    items,
    styles: { [OCR_FONT]: { fontFamily: "sans-serif", ascent: 0.8, descent: -0.2, vertical: false } },
    lang: ocr.lang,
  };
}

/** The lines Tesseract found, as fractions of the picture it was given. */
export function linesFromResult(
  blocks: { paragraphs?: { lines?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] }[] }[] | null | undefined,
  width: number, height: number,
): OcrLine[] {
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const lines: OcrLine[] = [];
  for (const block of blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        const text = line.text.replace(/\s+/g, " ").trim();
        const { x0, y0, x1, y1 } = line.bbox;
        if (!text || x1 <= x0 || y1 <= y0) continue;
        lines.push({ text, x: round(x0 / width), y: round(y0 / height), w: round((x1 - x0) / width), h: round((y1 - y0) / height) });
      }
    }
  }
  return lines;
}

/** A page with fewer letters than this is treated as a picture of a page. */
export const FEW_LETTERS = 16;
