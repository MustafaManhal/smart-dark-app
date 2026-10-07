import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

async function selectText(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);
}
const mark = (page: Page) => page.locator('.page[data-page="1"] .hl').first();
async function openMenu(page: Page) {
  const box = (await mark(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return page.getByRole("dialog", { name: "Highlight" });
}
/** The line a mark draws: how thick it is and where it sits in the mark's box (0 top, 1 bottom). */
const lineOf = (page: Page) => mark(page).evaluate((el) => {
  const box = el.getBoundingClientRect();
  const line = getComputedStyle(el, "::after");
  const height = parseFloat(line.height);
  const top = line.top === "auto" ? box.height - parseFloat(line.bottom) - height : parseFloat(line.top);
  return { fill: getComputedStyle(el).backgroundColor, height, middle: (top + height / 2) / box.height };
});

test("a highlight can become an underline or a strikethrough, and back", async ({ page }) => {
  await openSample(page);
  await selectText(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(mark(page)).toHaveClass("hl");

  let menu = await openMenu(page);
  const styles = menu.getByRole("radiogroup", { name: "Mark style" });
  await expect(styles.getByRole("radio", { name: "Highlight" })).toBeChecked();
  await expect(menu).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `test/output/mark-menu-${test.info().project.name}.png` });
  await styles.getByRole("radio", { name: "Underline" }).click();
  await expect(mark(page)).toHaveClass("hl is-underline");
  await expect(styles.getByRole("radio", { name: "Underline" })).toBeChecked();
  const under = await lineOf(page);
  expect(under.fill).toBe("rgba(0, 0, 0, 0)"); // no fill, a line
  expect(under.height).toBeGreaterThanOrEqual(2);
  expect(under.middle).toBeGreaterThan(0.8); // at the foot of the words

  await styles.getByRole("radio", { name: "Strikethrough" }).click();
  await expect(mark(page)).toHaveClass("hl is-strike");
  const strike = await lineOf(page);
  expect(strike.middle).toBeGreaterThan(0.4);
  expect(strike.middle).toBeLessThan(0.65); // through the middle of the words
  await page.screenshot({ path: `test/output/mark-strike-${test.info().project.name}.png` });

  // It is kept, with its color.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(mark(page)).toHaveClass("hl is-strike");
  menu = await openMenu(page);
  await menu.getByRole("radio", { name: "Highlight", exact: true }).click();
  await expect(mark(page)).toHaveClass("hl");
  expect((await lineOf(page)).fill).not.toBe("rgba(0, 0, 0, 0)");
  // Undo brings the strikethrough back.
  await page.locator(".reader-title").click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(mark(page)).toHaveClass("hl is-strike");
});

test("the highlighter tool draws in the style chosen for it; the bar at a selection always highlights", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  const hint = page.locator(".mode-hint");
  await expect(hint).toContainText("Select text to highlight");
  await hint.getByRole("button", { name: "Mark style: Highlight" }).click();
  await expect(hint).toContainText("Select text to underline");
  await expect(hint.getByRole("button", { name: "Mark style: Underline" })).toBeVisible();
  await expect(hint).toBeInViewport({ ratio: 1 });
  await selectText(page, "colored words keep their hue");
  await expect(mark(page)).toHaveClass("hl is-underline");
  await hint.getByRole("button", { name: "Done" }).click();

  // Outside the tool, a color in the bar makes a plain highlight.
  await selectText(page, "Black body text");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").nth(1).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(2);
  await expect(page.locator('.page[data-page="1"] .hl:not(.is-underline)')).toHaveCount(1);

  // The tool remembers its style.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Highlight text" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to underline");
  await page.locator(".mode-hint").getByRole("button", { name: "Mark style: Underline" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to strike through");
  await page.locator(".mode-hint").getByRole("button", { name: "Mark style: Strikethrough" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to highlight");
});

test("the highlighter can mark an area of the page, for scans and figures", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  const hint = page.locator(".mode-hint");
  await hint.getByRole("button", { name: "Mark an area" }).click();
  await expect(hint).toContainText("Drag over a part of the page");
  await expect(hint).toBeInViewport({ ratio: 1 });

  // Drag over the photo, which has no words to select.
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  // (a part of the page that is on screen on a phone and on a wide window alike)
  // The same part of the page as before the toolbar of a wide window got its second row: the page starts lower there.
  const lower = Math.max(0, paper.y - 107);
  const from = { x: paper.x + paper.width * 0.58, y: 420 + lower };
  const to = { x: paper.x + paper.width * 0.9, y: 590 + lower };
  if (isMobile) {
    const fire = (type: string, at: { x: number; y: number }) => page.locator('.page[data-page="1"] canvas').dispatchEvent(type, {
      clientX: at.x, clientY: at.y, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, bubbles: true,
    });
    await fire("pointerdown", from);
    await fire("pointermove", to);
    await fire("pointerup", to);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2);
    await expect(page.locator(".area-ghost")).toBeVisible(); // the rectangle shows while it is drawn
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
  }
  await expect(page.locator(".area-ghost")).toHaveCount(0);
  const area = page.locator('.page[data-page="1"] .hl').first();
  await expect(area).toBeVisible();
  const box = (await area.boundingBox())!;
  expect(Math.abs(box.x - from.x)).toBeLessThan(4);
  expect(Math.abs(box.y - from.y)).toBeLessThan(4);
  expect(Math.abs(box.width - (to.x - from.x))).toBeLessThan(6);
  expect(Math.abs(box.height - (to.y - from.y))).toBeLessThan(6);
  await expect(page.getByRole("dialog", { name: "Highlight" })).toHaveCount(0); // drawing did not open its menu
  await page.screenshot({ path: `test/output/mark-area-${test.info().project.name}.png` });
  await hint.getByRole("button", { name: "Done" }).click();

  // Its menu has colors and Remove, and nothing that needs words.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const menu = page.getByRole("dialog", { name: "Highlight" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Copy text" })).toHaveCount(0);
  await expect(menu.getByRole("radiogroup", { name: "Mark style" })).toHaveCount(0);
  await menu.getByRole("radio", { name: "Blue" }).click();
  await page.locator(".reader-title").click();

  // The notes panel lists it, and it stays after a reload.
  await page.getByRole("button", { name: "Notes and highlights" }).click();
  await expect(page.getByRole("complementary", { name: "Notes and highlights" }).getByRole("list", { name: "Highlights" })).toContainText("Marked area");
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
});

test("a tap in area mode draws nothing, and Undo takes an area back", async ({ page, isMobile }) => {
  test.skip(isMobile, "mouse");
  await openSample(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  await page.locator(".mode-hint").getByRole("button", { name: "Mark an area" }).click();
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  await page.mouse.click(paper.x + paper.width * 0.5, paper.y + 300);
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(0);
  await page.mouse.move(paper.x + paper.width * 0.3, paper.y + 300);
  await page.mouse.down();
  await page.mouse.move(paper.x + paper.width * 0.6, paper.y + 420);
  await page.mouse.up();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(0);
  // Words are not selected by the drag.
  expect(await page.evaluate(() => getSelection()!.toString())).toBe("");
});
