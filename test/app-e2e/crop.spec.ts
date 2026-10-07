import { expect, test, type Page } from "@playwright/test";
import { expectPage, openSample } from "./helpers/reader";

const zoomNow = async (page: Page) => parseInt((await page.locator(".zoom-value").textContent())!, 10);

async function setCrop(page: Page, on: boolean) {
  await page.getByRole("button", { name: "Appearance" }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  // The margins are measured before the box is ticked, so this is a click and a wait, not setChecked.
  const box = sheet.getByRole("checkbox", { name: "Crop margins" });
  await box.click();
  await expect(page.locator('.page[data-page="1"]')).toHaveClass(on ? /is-cropped/ : /^page$/);
  await expect(box).toBeChecked({ checked: on });
  await sheet.getByRole("button", { name: "Close" }).click();
}

/** What is shown of a page: its box without the cut margins. */
const shownBox = (page: Page, n: number) => page.locator(`.page[data-page="${n}"]`).evaluate((el: HTMLElement) => {
  const box = el.getBoundingClientRect();
  const cut = (name: string) => parseFloat(el.style.getPropertyValue(`--crop-${name}`)) || 0;
  return { left: box.left + cut("l"), right: box.right - cut("r"), top: box.top + cut("t"), bottom: box.bottom - cut("b") };
});

test("crop margins makes the text larger and stays with the book", async ({ page }) => {
  await openSample(page);
  const before = await zoomNow(page);
  await setCrop(page, true);
  await expect.poll(() => zoomNow(page)).toBeGreaterThan(before * 1.08);
  const cropped = await zoomNow(page);

  // What is shown fills the width of the screen; nothing scrolls sideways.
  const width = page.viewportSize()!.width;
  const shown = await shownBox(page, 1);
  expect(shown.left).toBeGreaterThanOrEqual(0);
  expect(shown.right).toBeLessThanOrEqual(width);
  expect(shown.right - shown.left).toBeGreaterThan(width - 40);
  expect(await page.locator(".reader-scroll").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  // No words are cut: every line of text is inside what is shown.
  const outside = await page.locator('.page[data-page="1"]').evaluate((el: HTMLElement) => {
    const box = el.getBoundingClientRect();
    const cut = (name: string) => parseFloat(el.style.getPropertyValue(`--crop-${name}`)) || 0;
    return [...el.querySelectorAll(".textLayer span")].filter((span) => {
      const r = span.getBoundingClientRect();
      return r.width > 0 && (r.left < box.left + cut("l") - 1 || r.right > box.right - cut("r") + 1 || r.top < box.top + cut("t") - 1 || r.bottom > box.bottom - cut("b") + 1);
    }).length;
  });
  expect(outside).toBe(0);
  await page.screenshot({ path: `test/output/crop-${test.info().project.name}.png` });

  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.page[data-page="1"]')).toHaveClass(/is-cropped/);
  await expect.poll(() => zoomNow(page)).toBe(cropped);

  await setCrop(page, false);
  await expect.poll(() => zoomNow(page)).toBe(before);
  expect(await page.locator('.page[data-page="1"]').evaluate((el: HTMLElement) => el.style.margin)).toBe("");
});

test("pages follow each other without a gap of cut paper, and the page number is right", async ({ page }) => {
  await openSample(page);
  await setCrop(page, true);
  const first = await shownBox(page, 1);
  const second = await shownBox(page, 2);
  expect(second.top - first.bottom).toBeGreaterThan(4);
  expect(second.top - first.bottom).toBeLessThan(24);
  await page.getByRole("button", { name: /Go to page/ }).click();
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  await dialog.getByLabel("Page number").fill("2");
  await dialog.getByRole("button", { name: "Go" }).click();
  await expectPage(page, 2);
  // Page 2 starts under the bars, at what is shown of it.
  const top = (await shownBox(page, 2)).top;
  const bar = await page.locator(".reader-top").evaluate((el) => el.getBoundingClientRect().bottom);
  expect(top).toBeGreaterThan(bar);
  // (a short book on a tall phone ends before page 2 can reach the top)
  const atEnd = await page.locator(".reader-scroll").evaluate((el) => el.scrollTop >= el.scrollHeight - el.clientHeight - 2);
  if (!atEnd) expect(top).toBeLessThan(bar + 120); // the phone has two rows of floating tools under the bar
  await page.getByRole("button", { name: /^Back to page 1/ }).click();
  await expectPage(page, 1);
});

test("a highlight made with cropped margins sits on its words", async ({ page }) => {
  await openSample(page);
  await setCrop(page, true);
  const words = "colored words keep their hue";
  const span = page.locator(".textLayer span", { hasText: words }).first();
  await span.evaluate((el, t) => {
    const node = el.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, words);
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  const mark = page.locator('.page[data-page="1"] .hl').first();
  await expect(mark).toBeVisible();
  const a = (await mark.boundingBox())!;
  const b = (await span.boundingBox())!;
  expect(Math.abs(a.y - b.y)).toBeLessThan(6);
  expect(a.x).toBeGreaterThan(b.x - 4);
  expect(a.x + a.width).toBeLessThan(b.x + b.width + 4);
  // Tapping it opens its menu: the tap finds the right page under the overlap of the cut margins.
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await expect(page.locator(".popover")).toBeVisible();
  // With the margins back it is still on its words.
  await page.locator(".reader-title").click();
  await setCrop(page, false);
  const a2 = (await mark.boundingBox())!;
  const b2 = (await span.boundingBox())!;
  expect(Math.abs(a2.y - b2.y)).toBeLessThan(6);
  expect(a2.x).toBeGreaterThan(b2.x - 4);
});

test("a sticky note left in a margin moves onto what is shown", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Add sticky note" }).click();
  const sheetBox = (await page.locator('.page[data-page="1"]').boundingBox())!;
  await page.mouse.click(sheetBox.x + 6, sheetBox.y + 220); // in the left margin
  await expect(page.locator(".sticky")).toBeVisible();
  await page.locator(".sticky textarea").fill("margin note");
  await page.locator(".reader-title").click();
  await setCrop(page, true);
  const note = (await page.locator(".sticky").boundingBox())!;
  const shown = await shownBox(page, 1);
  expect(note.x).toBeGreaterThanOrEqual(shown.left - 1);
  expect(note.x + note.width).toBeLessThanOrEqual(shown.right + 1);
  await expect(page.locator(".sticky")).toBeInViewport();
});

test("a book without margins says so and stays as it is", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/full-bleed.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Full bleed").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Appearance" }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  await sheet.getByRole("checkbox", { name: "Crop margins" }).click();
  await expect(sheet.getByText("This book has no margins to cut.")).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: "Crop margins" })).not.toBeChecked();
  await expect(page.locator('.page[data-page="1"]')).not.toHaveClass(/is-cropped/);
});
