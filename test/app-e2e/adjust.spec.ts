import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

/** Color of page 1 at a point given in page fractions. */
const pixel = (page: Page, fx: number, fy: number) =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement, [x, y]) =>
    [...c.getContext("2d")!.getImageData(Math.round(c.width * x), Math.round(c.height * y), 1, 1).data].slice(0, 3), [fx, fy]);

/** The pixel of a page area (in page fractions) that scores highest. */
const strongest = (page: Page, [x0, y0, x1, y1]: number[], by: "light" | "dark" | "red" | "warm" | "colorful") =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement, [x0, y0, x1, y1, by]) => {
    const left = Math.round(c.width * (x0 as number)), top = Math.round(c.height * (y0 as number));
    const w = Math.round(c.width * (x1 as number)) - left, h = Math.round(c.height * (y1 as number)) - top;
    const data = c.getContext("2d")!.getImageData(left, top, w, h).data;
    const score = (r: number, g: number, b: number) =>
      by === "light" ? r + g + b : by === "dark" ? -(r + g + b) : by === "red" ? r - (g + b) / 2
        : by === "warm" ? r - b : Math.max(r, g, b) - Math.min(r, g, b);
    let best = [0, 0, 0], bestScore = -Infinity;
    for (let i = 0; i < data.length; i += 4) {
      const s = score(data[i], data[i + 1], data[i + 2]);
      if (s > bestScore) { bestScore = s; best = [data[i], data[i + 1], data[i + 2]]; }
    }
    return best;
  }, [x0, y0, x1, y1, by] as (number | string)[]);

// Spots in src/sample/sample.pdf (see scripts/make-sample-pdf.mjs).
const paper = (page: Page) => pixel(page, 0.01, 0.01);
const redBar = (page: Page) => pixel(page, 0.171, 0.406);
const photo = (page: Page) => pixel(page, 0.74, 0.362);
// Starts below the yellow band of the line above, which is warm and light by itself.
const BODY_LINE = [0.09, 0.163, 0.6, 0.176]; // "words keep a visible yellow band, ..." in black
const RED_WORDS = [0.09, 0.18, 0.21, 0.198]; // "Red warning" in red
const spread = (rgb: number[]) => Math.max(...rgb) - Math.min(...rgb);
const sum = (rgb: number[]) => rgb[0] + rgb[1] + rgb[2];

const openAppearance = async (page: Page) => {
  await page.getByRole("button", { name: "Appearance" }).click();
  return page.getByRole("dialog", { name: "Appearance" });
};

test("brightness and grayscale change the text; paper, charts and photos stay", async ({ page }) => {
  await openSample(page);
  const before = {
    paper: await paper(page), bar: await redBar(page), photo: await photo(page),
    ink: await strongest(page, BODY_LINE, "light"), red: await strongest(page, RED_WORDS, "colorful"),
  };
  expect(spread(before.bar)).toBeGreaterThan(60);
  expect(spread(before.photo)).toBeGreaterThan(20);
  expect(spread(before.red)).toBeGreaterThan(60);
  expect(sum(before.ink)).toBeGreaterThan(600);

  const sheet = await openAppearance(page);
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("Off");
  await expect(sheet.getByRole("button", { name: "Reset adjustments" })).toHaveCount(0);

  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "Lower brightness" }).click();
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("−20");
  await expect.poll(async () => sum(await strongest(page, BODY_LINE, "light"))).toBeLessThan(sum(before.ink) * 0.85);
  expect(await paper(page)).toEqual(before.paper);
  expect(await redBar(page)).toEqual(before.bar);
  expect(await photo(page)).toEqual(before.photo);

  await sheet.getByRole("slider", { name: "Grayscale" }).fill("100");
  await expect(sheet.locator("#adjust-grayscale-value")).toHaveText("+100");
  await expect.poll(async () => spread(await strongest(page, RED_WORDS, "colorful"))).toBeLessThanOrEqual(6);
  expect(await redBar(page)).toEqual(before.bar);
  expect(await photo(page)).toEqual(before.photo);
  expect(await paper(page)).toEqual(before.paper);
  await page.screenshot({ path: `test/output/adjust-${test.info().project.name}.png` });

  await sheet.getByRole("button", { name: "Reset adjustments" }).click();
  await expect.poll(() => strongest(page, BODY_LINE, "light")).toEqual(before.ink);
  expect(await strongest(page, RED_WORDS, "colorful")).toEqual(before.red);
  await expect(sheet.getByRole("button", { name: "Reset adjustments" })).toHaveCount(0);
});

test("sepia warms the text, not the paper, and the choice survives a reload", async ({ page }) => {
  await openSample(page);
  const paperBefore = await paper(page);
  const warmth = async () => {
    const [r, , b] = await strongest(page, BODY_LINE, "warm");
    return r - b;
  };
  const sheet = await openAppearance(page);
  await sheet.getByRole("slider", { name: "Sepia" }).fill("50");
  await expect.poll(warmth).toBeGreaterThan(15);
  expect(await paper(page)).toEqual(paperBefore);

  const lit = sum(await strongest(page, BODY_LINE, "light"));
  await sheet.getByRole("button", { name: "Lower contrast" }).click();
  await expect(sheet.locator("#adjust-contrast-value")).toHaveText("−5");
  // Lower contrast pulls light text toward gray; by then the setting is stored.
  await expect.poll(async () => sum(await strongest(page, BODY_LINE, "light"))).toBeLessThan(lit);
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect.poll(warmth).toBeGreaterThan(15);
  expect(await paper(page)).toEqual(paperBefore);
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

test("original pages: colored text gets brighter, white paper stays white", async ({ page }) => {
  await openSample(page);
  const sheet = await openAppearance(page);
  await sheet.getByRole("radio", { name: "Original" }).check();
  await expect.poll(async () => (await paper(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
  const photoBefore = await photo(page);
  const barBefore = await redBar(page);
  const redBefore = (await strongest(page, RED_WORDS, "red"))[0];
  for (let i = 0; i < 4; i++) await sheet.getByRole("button", { name: "Raise brightness" }).click();
  await expect(sheet.locator("#adjust-brightness-value")).toHaveText("+20");
  await expect.poll(async () => (await strongest(page, RED_WORDS, "red"))[0]).toBeGreaterThan(redBefore + 20);
  expect((await paper(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
  expect(await redBar(page)).toEqual(barBefore);
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
