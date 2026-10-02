import { expect, test } from "vitest";
import { normalizeRects, rectToCss } from "../../app/src/annotations/geometry";

const page = { left: 100, top: 50, width: 400, height: 600 };
const r = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("converts client rects to page fractions", () => {
  expect(normalizeRects([r(140, 110, 200, 12)], page)).toEqual([{ x: 0.1, y: 0.1, w: 0.5, h: 0.02 }]);
});

test("merges fragments on the same line and keeps separate lines apart", () => {
  const out = normalizeRects([r(140, 110, 100, 12), r(238, 111, 102, 11), r(140, 130, 80, 12)], page);
  expect(out).toHaveLength(2);
  expect(out[0].x).toBeCloseTo(0.1);
  expect(out[0].w).toBeCloseTo(0.5);
  expect(out[1].y).toBeCloseTo(80 / 600);
});

test("drops empty rects and clips to the page", () => {
  const out = normalizeRects([r(90, 110, 50, 12), r(200, 200, 0, 12)], page);
  expect(out).toHaveLength(1);
  expect(out[0].x).toBe(0);
  expect(out[0].w).toBeCloseTo(40 / 400);
});

test("css uses percentages", () => {
  expect(rectToCss({ x: 0.1, y: 0.2, w: 0.3, h: 0.04 })).toEqual({ left: "10%", top: "20%", width: "30%", height: "4%" });
});
