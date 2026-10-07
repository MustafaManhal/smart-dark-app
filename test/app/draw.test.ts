// @vitest-environment node
import { expect, test } from "vitest";
import { arrowHead, penPaths, thin, worthKeeping } from "../../app/src/draw/shapes";

test("points that add nothing are dropped, the first and the last are kept", () => {
  const points = [0.1, 0.1, 0.5, 0.1001, 0.1, 0.5, 0.1002, 0.1, 0.5, 0.2, 0.1, 0.5, 0.2001, 0.1, 0.5];
  expect(thin(points)).toEqual([0.1, 0.1, 0.5, 0.2, 0.1, 0.5, 0.2001, 0.1, 0.5]);
  expect(thin([0.3, 0.3, 0.5])).toEqual([0.3, 0.3, 0.5]);
});

test("a stroke with one pressure is one smooth path; a pen that pressed harder is drawn in pieces", () => {
  const even = penPaths([0.1, 0.1, 0.5, 0.2, 0.2, 0.5, 0.3, 0.1, 0.5], 0.004, 600, 800);
  expect(even).toHaveLength(1);
  expect(even[0].width).toBeCloseTo(2.4, 5);
  expect(even[0].d).toBe("M60 80Q120 160 150 120L180 80");
  const pressed = penPaths([0.1, 0.1, 0.1, 0.2, 0.2, 0.5, 0.3, 0.1, 0.9], 0.004, 600, 800);
  expect(pressed).toHaveLength(2);
  expect(pressed[1].width).toBeGreaterThan(pressed[0].width * 1.5); // harder at the end, thicker at the end
  expect(penPaths([0.5, 0.5, 0.5], 0.004, 600, 800)).toHaveLength(1); // a dot
});

test("an arrow's head opens back along its line", () => {
  const [ax, ay, tx, ty, bx, by] = arrowHead(0, 0, 100, 0, 10);
  expect([tx, ty]).toEqual([100, 0]);
  expect(ax).toBeLessThan(100);
  expect(bx).toBeLessThan(100);
  expect(ay).toBeCloseTo(-by, 5); // one side up, one side down
  expect(Math.hypot(ax - 100, ay)).toBeCloseTo(10, 5);
});

test("a dot of the pen is kept, a shape with no size and an empty text box are not", () => {
  expect(worthKeeping({ tool: "pen", points: [0.5, 0.5, 0.5] })).toBe(true);
  expect(worthKeeping({ tool: "rect", points: [0.5, 0.5, 0.501, 0.501] })).toBe(false);
  expect(worthKeeping({ tool: "arrow", points: [0.2, 0.2, 0.4, 0.3] })).toBe(true);
  expect(worthKeeping({ tool: "text", points: [0.1, 0.1], text: "  " })).toBe(false);
  expect(worthKeeping({ tool: "text", points: [0.1, 0.1], text: "note" })).toBe(true);
});
