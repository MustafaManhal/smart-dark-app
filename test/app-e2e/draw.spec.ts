import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

const shapes = (page: Page) => page.locator('.page[data-page="1"] .draw-shape');
const hint = (page: Page) => page.getByRole("toolbar", { name: "Drawing" });

/** A drag on the page, with the mouse or (on the phone project) a finger. */
async function drag(page: Page, isMobile: boolean, from: { x: number; y: number }, to: { x: number; y: number }) {
  if (isMobile) {
    const fire = (type: string, at: { x: number; y: number }) => page.locator('.page[data-page="1"] canvas').dispatchEvent(type, {
      clientX: at.x, clientY: at.y, pointerId: 5, pointerType: "touch", isPrimary: true, button: 0, bubbles: true,
    });
    await fire("pointerdown", from);
    await fire("pointermove", { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 + 12 });
    await fire("pointermove", to);
    await fire("pointerup", to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2 + 12, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
  }
}

test("the pen draws where the pointer goes, in the chosen color, and Undo takes it back", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Draw" }).click();
  await expect(hint(page)).toBeVisible();
  await expect(hint(page)).toBeInViewport({ ratio: 1 });
  await expect(hint(page).getByRole("radio", { name: "Pen" })).toBeChecked();
  await hint(page).getByRole("radio", { name: "Blue" }).click();
  await hint(page).getByRole("radio", { name: "Thick" }).click();

  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  const from = { x: paper.x + paper.width * 0.25, y: 420 };
  const to = { x: paper.x + paper.width * 0.7, y: 470 };
  await drag(page, isMobile, from, to);
  await expect(shapes(page)).toHaveCount(1);
  await expect(shapes(page)).not.toHaveAttribute("data-draw", "live"); // saved, no longer the stroke in the making
  const stroke = shapes(page).locator("path").first();
  await expect(stroke).toHaveAttribute("stroke", "#1c7ed6");
  const box = (await stroke.boundingBox())!;
  expect(Math.abs(box.x - from.x)).toBeLessThan(12);
  expect(Math.abs(box.x + box.width - to.x)).toBeLessThan(12);
  expect(box.y).toBeGreaterThan(from.y - 14);
  expect(box.y + box.height).toBeLessThan(to.y + 26);
  await page.screenshot({ path: `test/output/draw-${test.info().project.name}.png` });

  // Words are not selected by drawing over them, and the page did not scroll away.
  expect(await page.evaluate(() => getSelection()!.toString())).toBe("");
  await hint(page).getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(shapes(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(shapes(page)).toHaveCount(1);

  // Kept with the book, and the tool remembers its color.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(shapes(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Draw" }).click();
  await expect(hint(page).getByRole("radio", { name: "Blue" })).toBeChecked();
});

test("shapes: a line, an arrow, a box and an oval are made by a drag", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Draw" }).click();
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  const row = (i: number) => ({ from: { x: paper.x + paper.width * 0.2, y: 380 + i * 60 }, to: { x: paper.x + paper.width * 0.6, y: 410 + i * 60 } });
  for (const [i, tool] of (["Line", "Arrow", "Box", "Oval"] as const).entries()) {
    await hint(page).getByRole("radio", { name: tool, exact: true }).click();
    await drag(page, isMobile, row(i).from, row(i).to);
    await expect(shapes(page)).toHaveCount(i + 1);
  }
  await expect(page.locator('.page[data-page="1"] .draw-svg rect:not(.draw-hit)')).toHaveCount(1);
  await expect(page.locator('.page[data-page="1"] .draw-svg ellipse:not(.draw-hit)')).toHaveCount(1);
  const boxShape = (await page.locator('.page[data-page="1"] .draw-svg rect:not(.draw-hit)').boundingBox())!;
  expect(Math.abs(boxShape.width - paper.width * 0.4)).toBeLessThan(8);
  // A tap without a drag makes nothing.
  await page.mouse.click(paper.x + paper.width * 0.8, 400);
  await expect(shapes(page)).toHaveCount(4);
});

test("a text box is written where the page is tapped, can be changed, and the eraser removes drawings", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Draw" }).click();
  await hint(page).getByRole("radio", { name: "Text box" }).click();
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  await page.mouse.click(paper.x + paper.width * 0.3, 450);
  const editor = page.locator(".draw-text.is-editing");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Check this figure");
  await hint(page).getByRole("button", { name: "Done" }).click(); // leaving the box keeps it
  const text = page.locator('.page[data-page="1"] .draw-text');
  await expect(text).toHaveText("Check this figure");
  const box = (await text.boundingBox())!;
  expect(Math.abs(box.x - (paper.x + paper.width * 0.3))).toBeLessThan(6);
  expect(Math.abs(box.y - 450)).toBeLessThan(6);

  // A tap on it with the text tool changes it.
  await page.getByRole("button", { name: "Draw" }).click();
  await text.click();
  await expect(page.locator(".draw-text.is-editing")).toBeFocused();
  const before = await page.locator(".reader-scroll").evaluate((el) => el.scrollTop);
  await page.keyboard.press("End"); // the caret is at the end already; the book must not jump to its end
  await page.keyboard.type(" again");
  await page.keyboard.press("Escape");
  await expect(text).toHaveText("Check this figure again");
  expect(await page.locator(".reader-scroll").evaluate((el) => el.scrollTop)).toBe(before);
  await hint(page).getByRole("radio", { name: "Line", exact: true }).click();
  await page.mouse.move(paper.x + paper.width * 0.2, 560);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.5, 560, { steps: 3 });
  await page.mouse.up();
  await expect(shapes(page)).toHaveCount(1);
  await hint(page).getByRole("button", { name: "Done" }).click();

  // The eraser: one tap on the line, one on the text.
  await page.getByRole("button", { name: "Erase highlights and notes" }).click();
  await page.mouse.click(paper.x + paper.width * 0.35, 562);
  await expect(shapes(page)).toHaveCount(0);
  await expect(page.locator(".toast")).toContainText("Drawing removed");
  await text.click();
  await expect(text).toHaveCount(0);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(text).toHaveText("Check this figure again");
});

test("drawings turn with the page", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse");
  await openSample(page);
  await page.getByRole("button", { name: "Draw" }).click();
  await hint(page).getByRole("radio", { name: "Box", exact: true }).click();
  // A box around the words "colored words keep their hue".
  const words = (await page.locator(".textLayer span", { hasText: "colored words keep their hue" }).first().boundingBox())!;
  await page.mouse.move(words.x - 6, words.y - 6);
  await page.mouse.down();
  await page.mouse.move(words.x + words.width + 6, words.y + words.height + 6, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('.page[data-page="1"] .draw-svg rect:not(.draw-hit)')).toHaveCount(1);
  await hint(page).getByRole("button", { name: "Done" }).click();
  await page.keyboard.press("r");
  await expect(page.locator('.page[data-page="1"] .page-face')).toHaveAttribute("style", /rotate\(90deg\)/);
  // (the page is laid out again after the turn: wait for its words and the box to be back)
  const wordsNow = page.locator(".textLayer span", { hasText: "colored words keep their hue" }).first();
  const boxNow = page.locator('.page[data-page="1"] .draw-svg rect:not(.draw-hit)');
  await expect.poll(async () => !!(await wordsNow.boundingBox()) && !!(await boxNow.boundingBox())).toBe(true);
  await page.waitForTimeout(200);
  const turned = (await wordsNow.boundingBox())!;
  const shape = (await boxNow.boundingBox())!;
  // Still around the same words, now a column.
  expect(shape.height).toBeGreaterThan(shape.width);
  expect(shape.x).toBeLessThan(turned.x + 2);
  expect(shape.x + shape.width).toBeGreaterThan(turned.x + turned.width - 2);
  expect(shape.y).toBeLessThan(turned.y + 2);
  expect(shape.y + shape.height).toBeGreaterThan(turned.y + turned.height - 2);
});

test("a signature is written once and then placed on a page with a tap", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Draw" }).click();
  await hint(page).getByRole("radio", { name: "Signature" }).click();
  // No signature yet: the box to write one opens.
  const pad = page.getByRole("dialog", { name: "Your signature" });
  await expect(pad).toBeVisible();
  await expect(pad.getByRole("button", { name: "Use this signature" })).toBeDisabled();
  const area = (await pad.getByRole("img", { name: "Signature box" }).boundingBox())!;
  const stroke = async (points: [number, number][]) => {
    const at = (p: [number, number]) => ({ x: area.x + area.width * p[0], y: area.y + area.height * p[1] });
    if (isMobile) {
      const fire = (type: string, p: [number, number]) => pad.getByRole("img", { name: "Signature box" }).dispatchEvent(type, {
        clientX: at(p).x, clientY: at(p).y, pointerId: 3, pointerType: "touch", isPrimary: true, button: 0, bubbles: true,
      });
      await fire("pointerdown", points[0]);
      for (const p of points.slice(1)) await fire("pointermove", p);
      await fire("pointerup", points.at(-1)!);
    } else {
      await page.mouse.move(at(points[0]).x, at(points[0]).y);
      await page.mouse.down();
      for (const p of points.slice(1)) await page.mouse.move(at(p).x, at(p).y, { steps: 3 });
      await page.mouse.up();
    }
  };
  await stroke([[0.15, 0.6], [0.3, 0.3], [0.4, 0.7], [0.55, 0.4]]);
  await stroke([[0.6, 0.7], [0.85, 0.65]]);
  await expect(pad.locator(".sign-pad path")).toHaveCount(2);
  await page.screenshot({ path: `test/output/signature-pad-${test.info().project.name}.png` });
  await pad.getByRole("button", { name: "Use this signature" }).click();
  await expect(pad).toBeHidden();

  // A tap puts it on the page, about 30% of the page wide, around the tap.
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  const tap = { x: paper.x + paper.width * 0.5, y: 500 };
  await page.mouse.click(tap.x, tap.y);
  await expect(shapes(page)).toHaveCount(1);
  await expect(shapes(page).locator("path:not(.draw-hit)")).toHaveCount(2); // both strokes
  const first = (await shapes(page).locator("path:not(.draw-hit)").first().boundingBox())!;
  expect(first.x).toBeGreaterThan(tap.x - paper.width * 0.16);
  expect(first.x + first.width).toBeLessThan(tap.x + paper.width * 0.16);
  expect(Math.abs(first.y + first.height / 2 - tap.y)).toBeLessThan(paper.width * 0.06);
  // A second tap places it again; the signature is remembered after a reload.
  await page.mouse.click(tap.x, tap.y + 90);
  await expect(shapes(page)).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(shapes(page)).toHaveCount(2);
  await page.getByRole("button", { name: "Draw" }).click();
  await expect(hint(page).getByRole("radio", { name: "Signature" })).toBeChecked();
  await expect(page.getByRole("dialog", { name: "Your signature" })).toHaveCount(0); // it has one now
  await expect(hint(page)).toBeInViewport({ ratio: 1 });
  await hint(page).getByRole("button", { name: "New signature" }).click();
  await expect(page.getByRole("dialog", { name: "Your signature" })).toBeVisible();
});
