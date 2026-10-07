// @vitest-environment node
import { expect, test } from "vitest";
import { linesFromResult, OCR_FONT, toTextContent, type OcrPage } from "../../app/src/ocr/text";

// An upright A4 page as pdf.js describes it at scale 1: y grows upward in the PDF, downward on screen.
const viewport = { width: 595, height: 842, transform: [1, 0, 0, -1, 0, 842] };
const page: OcrPage = {
  id: "b:1", bookId: "b", page: 1, lang: "eng",
  lines: [{ text: "The Lighthouse Keeper", x: 0.1, y: 0.2, w: 0.5, h: 0.03 }, { text: "  ", x: 0, y: 0, w: 0.1, h: 0.1 }, { text: "مرحبا بالعالم", x: 0.3, y: 0.5, w: 0.4, h: 0.03 }],
};

test("recognized lines become text items that sit on their line in the picture", () => {
  const content = toTextContent(page, viewport);
  expect(content.items).toHaveLength(2); // the empty line is left out
  const [first, arabic] = content.items;
  expect(first.str).toBe("The Lighthouse Keeper");
  expect(first.dir).toBe("ltr");
  expect(first.width).toBeCloseTo(297.5, 3);
  const size = 0.03 * 842 * 0.8;
  expect(first.height).toBeCloseTo(size, 3);
  // Upright letters of that size, at the left edge of the line, standing a fifth above the foot of its box.
  expect(first.transform.slice(0, 4).map((v) => +v.toFixed(3))).toEqual([+size.toFixed(3), 0, 0, +size.toFixed(3)]);
  expect(first.transform[4]).toBeCloseTo(59.5, 3);
  expect(first.transform[5]).toBeCloseTo(842 - (0.23 * 842 - 0.03 * 842 * 0.2), 3);
  expect(arabic.dir).toBe("rtl");
  expect(first.fontName).toBe(OCR_FONT);
  expect(content.styles[OCR_FONT]).toMatchObject({ vertical: false });
});

test("on a page the PDF turns by a quarter, the text is turned back so it reads upright on screen", () => {
  // pdf.js viewport transform of a page with /Rotate 90 (595 wide, 842 high before the turn).
  const turned = { width: 842, height: 595, transform: [0, 1, 1, 0, 0, 0] };
  const [item] = toTextContent({ ...page, lines: [page.lines[0]] }, turned).items;
  // Putting the page's matrix back gives upright text at its place in the picture.
  const [a, b, c, d, e, f] = turned.transform;
  const [ta, tb, tc, td, te, tf] = item.transform;
  const onScreen = [a * ta + c * tb, b * ta + d * tb, a * tc + c * td, b * tc + d * td, a * te + c * tf + e, b * te + d * tf + f];
  const size = 0.03 * 595 * 0.8;
  expect(onScreen.map((v) => +v.toFixed(3))).toEqual([+size.toFixed(3), 0, 0, -+size.toFixed(3), +(0.1 * 842).toFixed(3), +(0.23 * 595 - 0.03 * 595 * 0.2).toFixed(3)]);
});

test("the engine's result is flattened to lines in fractions of the picture", () => {
  const blocks = [{ paragraphs: [{ lines: [
    { text: "Every evening at dusk\n", bbox: { x0: 100, y0: 200, x1: 900, y1: 250 } },
    { text: "   ", bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
    { text: "broken", bbox: { x0: 50, y0: 50, x1: 50, y1: 80 } },
  ] }] }, { paragraphs: [{ lines: [{ text: "the  keeper   climbed", bbox: { x0: 100, y0: 300, x1: 600, y1: 350 } }] }] }];
  expect(linesFromResult(blocks, 1000, 2000)).toEqual([
    { text: "Every evening at dusk", x: 0.1, y: 0.1, w: 0.8, h: 0.025 },
    { text: "the keeper climbed", x: 0.1, y: 0.15, w: 0.5, h: 0.025 },
  ]);
  expect(linesFromResult(null, 10, 10)).toEqual([]);
});
