import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

const WORDS = "colored words keep their hue";
const span = (page: Page) => page.locator(".textLayer span", { hasText: WORDS }).first();
const boxOf = async (locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!;

async function rotate(page: Page, name: "Rotate right" | "Rotate left", times = 1) {
  await page.getByRole("button", { name: "Appearance" }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  for (let i = 0; i < times; i++) await sheet.getByRole("button", { name }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
}

/** Selects the words and gives the screen box of the selection (the highlight should land on it). */
async function selectWords(page: Page) {
  return span(page).evaluate((el, t) => {
    const node = el.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
    // Measured in the same step: the page may lay its text out again right after a turn.
    const b = range.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }, WORDS);
}

const near = (a: { x: number; y: number; width: number; height: number }, b: typeof a, by = 6) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(by);
  expect(Math.abs(a.y - b.y)).toBeLessThan(by);
  expect(Math.abs(a.width - b.width)).toBeLessThan(by * 2);
  expect(Math.abs(a.height - b.height)).toBeLessThan(by * 2);
};

test("the pages turn by quarter turns, stay turned, and come back", async ({ page }) => {
  await openSample(page);
  const sheetOfPaper = page.locator('.page[data-page="1"]');
  const upright = await boxOf(sheetOfPaper);
  expect(upright.height).toBeGreaterThan(upright.width);
  const line = await boxOf(span(page));
  expect(line.width).toBeGreaterThan(line.height);

  await rotate(page, "Rotate right");
  const turned = await boxOf(sheetOfPaper);
  expect(turned.width).toBeGreaterThan(turned.height); // the page lies on its side
  const column = await boxOf(span(page));
  expect(column.height).toBeGreaterThan(column.width); // and so do its words
  // It still fits the width of the screen, and nothing scrolls sideways.
  expect(turned.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await page.locator(".reader-scroll").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.screenshot({ path: `test/output/rotate-${test.info().project.name}.png` });

  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  expect((await boxOf(sheetOfPaper)).width).toBeGreaterThan((await boxOf(sheetOfPaper)).height);
  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(page.getByRole("dialog", { name: "Appearance" }).getByText("90°")).toBeVisible();
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();

  await rotate(page, "Rotate left");
  const back = await boxOf(sheetOfPaper);
  expect(back.height).toBeGreaterThan(back.width);
  expect(await page.locator('.page[data-page="1"] .page-face').evaluate((el: HTMLElement) => el.style.transform)).toBe("");
});

for (const turns of [1, 2, 3]) {
  test(`a highlight made on a page turned ${turns * 90}° sits on its words, there and upright`, async ({ page }) => {
    await openSample(page);
    await rotate(page, "Rotate right", turns);
    const words = await selectWords(page);
    await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
    const mark = page.locator('.page[data-page="1"] .hl').first();
    await expect(mark).toBeVisible();
    near(await boxOf(mark), words);

    // A tap on it finds it, on the turned page (upside down, these words are far down the page).
    await mark.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const at = await boxOf(mark);
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
    await expect(page.getByRole("dialog", { name: "Highlight" })).toBeVisible();
    await page.locator(".reader-title").click();

    // Turned back, it is still on the same words.
    await rotate(page, "Rotate left", turns);
    near(await boxOf(mark), await selectWords(page));
  });
}

test("a highlight made upright follows its words when the page is turned", async ({ page }) => {
  await openSample(page);
  await selectWords(page);
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  const mark = page.locator('.page[data-page="1"] .hl').first();
  await expect(mark).toBeVisible();
  await rotate(page, "Rotate right");
  near(await boxOf(mark), await selectWords(page));
});

test("a sticky note goes where the tap is on a turned page, and stays upright", async ({ page }) => {
  await openSample(page);
  await rotate(page, "Rotate right");
  await page.getByRole("button", { name: "Add sticky note" }).click();
  const paper = await boxOf(page.locator('.page[data-page="1"]'));
  const tap = { x: paper.x + paper.width * 0.5, y: paper.y + Math.min(paper.height * 0.5, 260) };
  await page.mouse.click(tap.x, tap.y);
  const note = page.locator(".sticky");
  await expect(note).toBeVisible();
  const box = await boxOf(note);
  expect(Math.abs(box.x + box.width / 2 - tap.x)).toBeLessThan(box.width / 2 + 4);
  expect(box.y).toBeLessThan(tap.y + 4);
  expect(box.y).toBeGreaterThan(tap.y - 60);
  expect(box.width).toBeGreaterThan(box.height * 0.9); // not lying on its side
  await page.locator(".sticky textarea").fill("on a turned page");
  await page.locator(".reader-title").click();
  // It is still inside the page after the page is turned back.
  await rotate(page, "Rotate left");
  const upright = await boxOf(page.locator('.page[data-page="1"]'));
  const moved = await boxOf(note);
  expect(moved.x).toBeGreaterThanOrEqual(upright.x - 1);
  expect(moved.y).toBeGreaterThanOrEqual(upright.y - 1);
  await expect(page.locator(".sticky textarea")).toHaveValue("on a turned page");
});

test("search marks and cropped margins work on a turned page", async ({ page }) => {
  await openSample(page);
  await rotate(page, "Rotate right");
  await page.getByRole("button", { name: "Search in book" }).click();
  await page.locator(".search-row input").fill("keep their hue");
  const found = page.locator('.page[data-page="1"] .search-layer .found').first();
  await expect(found).toBeVisible();
  const mark = await boxOf(found);
  const words = await boxOf(span(page));
  expect(mark.height).toBeGreaterThan(mark.width); // a column, like the words
  expect(mark.x).toBeGreaterThan(words.x - 6);
  expect(mark.x + mark.width).toBeLessThan(words.x + words.width + 6);
  expect(mark.y).toBeGreaterThan(words.y - 6);
  expect(mark.y + mark.height).toBeLessThan(words.y + words.height + 6);
  await page.locator(".search-row .icon-btn").last().click();

  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("checkbox", { name: "Crop margins" }).click();
  await expect(page.locator('.page[data-page="1"]')).toHaveClass(/is-cropped/);
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();
  expect(await page.locator(".reader-scroll").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // No words are cut off by the crop on the turned page.
  const outside = await page.locator('.page[data-page="1"]').evaluate((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const cut = (name: string) => parseFloat(el.style.getPropertyValue(`--crop-${name}`)) || 0;
    return [...el.querySelectorAll(".textLayer span")].filter((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left + cut("l") - 1 || r.right > box.right - cut("r") + 1 || r.top < box.top + cut("t") - 1 || r.bottom > box.bottom - cut("b") + 1);
    }).length;
  });
  expect(outside).toBe(0);
  await page.screenshot({ path: `test/output/rotate-crop-${test.info().project.name}.png` });
});

test("R turns the pages from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await openSample(page);
  await page.keyboard.press("r");
  await expect(page.locator('.page[data-page="1"] .page-face')).toHaveAttribute("style", /rotate\(90deg\)/);
  await page.keyboard.press("Shift+R");
  await expect(page.locator('.page[data-page="1"] .page-face')).not.toHaveAttribute("style", /rotate/);
});
