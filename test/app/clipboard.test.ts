import { expect, test } from "vitest";
import { placeSelectionBar } from "../../app/src/annotations/SelectionBar";
import { tidyCopiedText } from "../../app/src/platform/clipboard";

test("copied text reads as sentences, not as lines of the page", () => {
  expect(tidyCopiedText("Long documents render lazily: only the pages\nnear the screen are drawn.")).toBe(
    "Long documents render lazily: only the pages near the screen are drawn.");
  expect(tidyCopiedText("an exam-\nple of a split word")).toBe("an example of a split word");
  expect(tidyCopiedText("the years 1990-\n1995 and Jean-\nPaul")).toBe("the years 1990-1995 and Jean-Paul");
  expect(tidyCopiedText("  spaced   out \n\n text ")).toBe("spaced out text");
  expect(tidyCopiedText("نص عربي\nعلى سطرين")).toBe("نص عربي على سطرين");
});

const size = { w: 300, h: 44 };
const selection = { left: 400, right: 600, top: 300, bottom: 320 };

test("with a mouse the bar sits just above the selection, centered on it", () => {
  const view = { width: 1280, minTop: 53, maxBottom: 800, touch: false };
  expect(placeSelectionBar(selection, size, view)).toEqual({ left: 350, top: 248 });
  // No room above (right under the top bar): it goes below.
  expect(placeSelectionBar({ ...selection, top: 70, bottom: 90 }, size, view).top).toBe(98);
});

test("on touch screens the bar goes below, clear of the system menu and handles", () => {
  const view = { width: 390, minTop: 97, maxBottom: 800, touch: true };
  const narrow = { left: 40, right: 120, top: 300, bottom: 320 };
  expect(placeSelectionBar(narrow, size, view)).toEqual({ left: 8, top: 348 });
  // A selection at the bottom of the screen: the bar goes above, past the system menu.
  expect(placeSelectionBar({ ...narrow, top: 740, bottom: 760 }, size, view).top).toBe(632);
});

test("the bar always stays on screen", () => {
  const view = { width: 390, minTop: 97, maxBottom: 800, touch: true };
  const offscreen = placeSelectionBar({ left: 300, right: 380, top: 2000, bottom: 2020 }, size, view);
  expect(offscreen).toEqual({ left: 82, top: 748 });
  const above = placeSelectionBar({ left: 0, right: 40, top: -500, bottom: -480 }, size, { ...view, touch: false });
  expect(above).toEqual({ left: 8, top: 105 });
});
