// @vitest-environment node
import { expect, test } from "vitest";
import { fromViewPoint, fromViewRect, toViewPoint, toViewRect, turnCut, type Turn } from "../../app/src/annotations/geometry";

const TURNS: Turn[] = [0, 90, 180, 270];

test("a quarter turn clockwise moves the top left corner to the top right", () => {
  expect(toViewPoint(0, 0, 90)).toEqual([1, 0]);
  expect(toViewPoint(1, 0, 90)).toEqual([1, 1]);
  expect(toViewPoint(0, 0, 180)).toEqual([1, 1]);
  expect(toViewPoint(0, 0, 270)).toEqual([0, 1]);
  expect(toViewPoint(0.2, 0.7, 0)).toEqual([0.2, 0.7]);
});

test("turning to the screen and back gives the same point and the same rectangle", () => {
  for (const turn of TURNS) {
    const [u, v] = toViewPoint(0.2, 0.7, turn);
    const [x, y] = fromViewPoint(u, v, turn);
    expect([x, y].map((n) => +n.toFixed(6))).toEqual([0.2, 0.7]);
    const rect = { x: 0.1, y: 0.2, w: 0.5, h: 0.05 };
    expect(fromViewRect(toViewRect(rect, turn), turn)).toEqual(rect);
  }
});

test("a line of text becomes a column after a quarter turn", () => {
  const line = { x: 0.1, y: 0.2, w: 0.5, h: 0.05 };
  expect(toViewRect(line, 90)).toEqual({ x: 0.75, y: 0.1, w: 0.05, h: 0.5 });
  expect(toViewRect(line, 180)).toEqual({ x: 0.4, y: 0.75, w: 0.5, h: 0.05 });
  expect(toViewRect(line, 270)).toEqual({ x: 0.2, y: 0.4, w: 0.05, h: 0.5 });
});

test("cut margins turn with the page", () => {
  const cut = { l: 0.1, r: 0.2, t: 0.3, b: 0.4 };
  expect(turnCut(cut, 0)).toEqual(cut);
  expect(turnCut(cut, 90)).toEqual({ t: 0.1, r: 0.3, b: 0.2, l: 0.4 }); // the left edge is now on top
  expect(turnCut(cut, 180)).toEqual({ t: 0.4, r: 0.1, b: 0.3, l: 0.2 });
  expect(turnCut(cut, 270)).toEqual({ t: 0.2, r: 0.4, b: 0.1, l: 0.3 });
});
