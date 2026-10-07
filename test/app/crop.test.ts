// @vitest-environment node
import { expect, test } from "vitest";
import { bookCrop, contentBox, cutFor, pagesToMeasure, type Box } from "../../app/src/reader/crop";

/** A white page `w` by `h` with dark rectangles [x0, y0, x1, y1). */
function page(w: number, h: number, inks: [number, number, number, number][], paper = [255, 255, 255]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...paper, 255], i * 4);
  for (const [x0, y0, x1, y1] of inks) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set([20, 20, 30, 255], (y * w + x) * 4);
  }
  return data;
}

test("finds the box around the ink of a page", () => {
  expect(contentBox(page(100, 200, [[10, 20, 80, 30], [15, 150, 90, 180]]), 100, 200)).toEqual({ l: 0.1, t: 0.1, r: 0.9, b: 0.9 });
});

test("an empty page has no box, on white or on colored paper", () => {
  expect(contentBox(page(50, 50, []), 50, 50)).toBeNull();
  expect(contentBox(page(50, 50, [], [250, 240, 215]), 50, 50)).toBeNull();
});

test("paper that is not white is still paper", () => {
  expect(contentBox(page(100, 100, [[30, 40, 60, 50]], [28, 30, 36]), 100, 100)).toBeNull(); // ink as dark as the paper
  const box = contentBox(page(100, 100, [[30, 40, 60, 50]], [250, 240, 215]), 100, 100);
  expect(box).toEqual({ l: 0.3, t: 0.4, r: 0.6, b: 0.5 });
});

const box = (l: number, t: number, r: number, b: number): Box => ({ l, t, r, b });

test("one crop for the book that cuts no ink from any page", () => {
  const crop = bookCrop([
    { page: 1, box: box(0.2, 0.1, 0.9, 0.9) },
    { page: 2, box: box(0.1, 0.12, 0.8, 0.85) },
    { page: 3, box: box(0.22, 0.15, 0.88, 0.8) },
    { page: 4, box: null },
  ])!;
  // odd pages keep 0.2 to 0.9, even pages 0.1 to 0.8, each with a little air
  expect(crop.odd).toEqual([0.185, 0.085]);
  expect(crop.even).toEqual([0.085, 0.185]);
  expect(crop.t).toBe(0.085);
  expect(crop.b).toBe(0.085);
  expect(cutFor(crop, 3)).toEqual({ l: 0.185, r: 0.085, t: 0.085, b: 0.085 });
  expect(cutFor(crop, 2)).toEqual({ l: 0.085, r: 0.185, t: 0.085, b: 0.085 });
  expect(cutFor(null, 2)).toEqual({ l: 0, r: 0, t: 0, b: 0 });
});

test("odd and even pages get the same width", () => {
  const crop = bookCrop([{ page: 1, box: box(0.3, 0.1, 0.9, 0.9) }, { page: 2, box: box(0.1, 0.1, 0.8, 0.9) }])!;
  const width = (sides: [number, number]) => 1 - sides[0] - sides[1];
  expect(width(crop.odd)).toBeCloseTo(width(crop.even), 5);
  expect(width(crop.even)).toBeCloseTo(0.73, 5); // the wider of the two, plus air
  expect(crop.odd[0]).toBeLessThanOrEqual(0.3);
  expect(1 - crop.odd[1]).toBeGreaterThanOrEqual(0.9);
});

test("a cover that fills its page does not stop the crop, a scanned book does", () => {
  const text = Array.from({ length: 9 }, (_, i) => ({ page: i + 2, box: box(0.15, 0.1, 0.85, 0.9) }));
  expect(bookCrop([{ page: 1, box: box(0, 0, 1, 1) }, ...text])).not.toBeNull();
  const scans = Array.from({ length: 10 }, (_, i) => ({ page: i + 1, box: box(0, 0, 1, 1) }));
  expect(bookCrop(scans)).toBeNull();
});

test("nothing worth cutting gives no crop", () => {
  expect(bookCrop([{ page: 1, box: box(0.02, 0.02, 0.99, 0.99) }])).toBeNull();
  expect(bookCrop([{ page: 1, box: null }])).toBeNull();
  expect(bookCrop([])).toBeNull();
});

test("a very long book is measured on odd and even pages across its length", () => {
  expect(pagesToMeasure(5)).toEqual([1, 2, 3, 4, 5]);
  const pages = pagesToMeasure(2000, 300);
  expect(pages.length).toBeLessThanOrEqual(300);
  expect(pages[0]).toBe(1);
  expect(pages.at(-1)).toBe(2000);
  expect(pages.filter((p) => p % 2 === 0).length).toBeGreaterThan(100);
  expect(pages.filter((p) => p % 2 === 1).length).toBeGreaterThan(100);
});
