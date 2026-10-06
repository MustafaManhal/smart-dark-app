import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

/** Color of page 1 at a point given in page fractions. */
const pixel = (page: Page, fx: number, fy: number) =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement, [x, y]) =>
    [...c.getContext("2d")!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data].slice(0, 3), [fx, fy]);

// Spots in src/sample/sample.pdf (see scripts/make-sample-pdf.mjs).
const paper = (page: Page) => pixel(page, 0.01, 0.01);
const redBar = (page: Page) => pixel(page, 0.171, 0.406);
const photo = (page: Page) => pixel(page, 0.74, 0.362);
const spread = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb);

const openAppearance = async (page: Page) => {
  await page.getByRole("button", { name: "Appearance" }).click();
  return page.getByRole("dialog", { name: "Appearance" });
};

test("brightness and grayscale change text and paper, photos stay as they are", async ({ page }) => {
  await openSample(page);
  const before = { paper: await paper(page), bar: await redBar(page), photo: await photo(page) };
  expect(spread(before.bar)).toBeGreaterThan(60);
  expect(spread(before.photo)).toBeGreaterThan(20);

  const sheet = await openAppearance(page);
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("Off");
  await expect(sheet.getByRole("button", { name: "Reset adjustments" })).toHaveCount(0);

  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "Raise brightness" }).click();
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("+20");
  await expect.poll(async () => (await paper(page)).every((v, i) => v > before.paper[i])).toBe(true);
  expect(await photo(page)).toEqual(before.photo);

  await sheet.getByRole("slider", { name: "Grayscale" }).fill("100");
  await expect(sheet.locator("#adjust-grayscale-value")).toHaveText("+100");
  await expect.poll(async () => spread(await redBar(page))).toBeLessThanOrEqual(2);
  expect(await photo(page)).toEqual(before.photo);
  await page.screenshot({ path: `test/output/adjust-${test.info().project.name}.png` });

  await sheet.getByRole("button", { name: "Reset adjustments" }).click();
  await expect.poll(() => paper(page)).toEqual(before.paper);
  expect(await redBar(page)).toEqual(before.bar);
  await expect(sheet.getByRole("button", { name: "Reset adjustments" })).toHaveCount(0);
});

test("sepia warms dark pages and the choice survives a reload", async ({ page }) => {
  await openSample(page);
  const sheet = await openAppearance(page);
  await sheet.getByRole("slider", { name: "Sepia" }).fill("50");
  await expect.poll(async () => {
    const [r, , b] = await paper(page);
    return r - b;
  }).toBeGreaterThan(2);
  const warm = await paper(page);
  await sheet.getByRole("button", { name: "Lower contrast" }).click();
  await expect(sheet.locator("#adjust-contrast-value")).toHaveText("−5");
  // Lower contrast lifts dark paper toward gray; by then the setting is stored.
  await expect.poll(async () => (await paper(page))[0]).toBeGreaterThan(warm[0]);
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect.poll(async () => {
    const [r, , b] = await paper(page);
    return r - b;
  }).toBeGreaterThan(2);
  const again = await openAppearance(page);
  await expect(again.locator("#adjust-sepia-value")).toHaveText("+50");
  await expect(again.locator("#adjust-contrast-value")).toHaveText("−5");

  // The same controls are on the settings screen.
  await again.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("slider", { name: "Sepia" })).toHaveValue("50");
  await page.getByRole("button", { name: "Reset adjustments" }).click();
  await expect(page.getByRole("slider", { name: "Sepia" })).toHaveValue("0");
});

test("original pages can be adjusted too", async ({ page }) => {
  await openSample(page);
  const sheet = await openAppearance(page);
  await sheet.getByRole("radio", { name: "Original" }).check();
  await expect.poll(async () => (await paper(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
  const photoBefore = await photo(page);
  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "Lower brightness" }).click();
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("−20");
  await expect.poll(async () => (await paper(page)).join()).toBe("204,204,204");
  expect(await photo(page)).toEqual(photoBefore);
});

test("adjust controls fit a 320px screen", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "layout check runs once, in Chromium");
  await page.setViewportSize({ width: 320, height: 640 });
  await openSample(page);
  const sheet = await openAppearance(page);
  for (const name of ["Brightness", "Contrast", "Sepia", "Grayscale"]) {
    const slider = sheet.getByRole("slider", { name });
    await slider.scrollIntoViewIfNeeded();
    await expect(slider).toBeInViewport();
    expect((await slider.boundingBox())!.width).toBeGreaterThan(120);
  }
  await page.screenshot({ path: `test/output/adjust-320.png` });
});

test("the page stays in view behind the appearance sheet", async ({ page }) => {
  await openSample(page);
  const sheet = await openAppearance(page);
  await page.waitForTimeout(400); // let the sheet finish sliding in
  const box = (await sheet.boundingBox())!;
  const view = page.viewportSize()!;
  expect(box.width * box.height).toBeLessThan(view.width * view.height * 0.6);
  await page.screenshot({ path: `test/output/adjust-peek-${test.info().project.name}.png` });
});

test("Arabic: controls are translated and values stay in Western digits", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).check();
  await page.getByRole("button", { name: "رفع التباين" }).click();
  const value = page.locator("#adjust-contrast-value");
  await expect(value).toHaveText("+5");
  await expect(value).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("slider", { name: "السطوع" })).toBeVisible();
  await page.getByRole("slider", { name: "التباين" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test/output/adjust-arabic-${test.info().project.name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
