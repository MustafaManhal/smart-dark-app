import { expect, test, type Page } from "@playwright/test";

// The recognition engine is a few megabytes of WebAssembly: these tests take longer than the others.
test.describe.configure({ timeout: 180_000 });

async function openScan(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/scan.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Scanned sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
}

async function recognize(page: Page) {
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Recognize text/ }).click();
  const sheet = page.getByRole("dialog", { name: "Recognize text" });
  await expect(sheet.getByRole("radio", { name: "English", exact: true })).toBeChecked();
  await expect(sheet).toBeInViewport({ ratio: 1 });
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Text was recognized on 2 pages.", { timeout: 150_000 });
  return sheet;
}

test("a scanned book gets words: they can be searched, selected and are kept", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openScan(page);
  // Before: the pages are pictures. A search finds nothing.
  await page.getByRole("button", { name: "Search in book" }).click();
  await page.locator(".search-row input").fill("lighthouse");
  await expect(page.locator(".search-row")).toContainText("No matches");
  await page.locator(".search-row .icon-btn").last().click();
  await expect(page.locator('.page[data-page="1"] .textLayer span')).toHaveCount(0);

  const sheet = await recognize(page);
  await page.screenshot({ path: `test/output/ocr-${test.info().project.name}.png` });
  await sheet.getByRole("button", { name: "Close" }).click();

  // The words lie on their lines in the picture.
  const title = page.locator('.page[data-page="1"] .textLayer span', { hasText: "Lighthouse" }).first();
  await expect(title).toBeVisible();
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  const box = (await title.boundingBox())!;
  // In the picture the title starts 11% in and about 9% down the page.
  expect((box.x - paper.x) / paper.width).toBeGreaterThan(0.08);
  expect((box.x - paper.x) / paper.width).toBeLessThan(0.16);
  expect((box.y - paper.y) / paper.height).toBeGreaterThan(0.06);
  expect((box.y - paper.y) / paper.height).toBeLessThan(0.14);
  expect(box.width / paper.width).toBeGreaterThan(0.4); // as wide as the printed title

  // Search finds a word on page 2, and the match is marked on the page.
  await page.getByRole("button", { name: "Search in book" }).click();
  await page.locator(".search-row input").fill("harbor");
  await expect(page.locator('.page[data-page="2"] .search-layer .found.is-current')).toBeVisible();
  await page.locator(".search-row .icon-btn").last().click();

  // The words can be highlighted like any text.
  await page.locator('.page[data-page="1"] .textLayer span', { hasText: "ninety-two" }).first().evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);

  // Kept: after a reload the text is there without recognizing again.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.page[data-page="1"] .textLayer span', { hasText: "Lighthouse" }).first()).toBeVisible();
  // A second run has nothing left to do.
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Recognize text/ }).click();
  await page.getByRole("dialog", { name: "Recognize text" }).getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("dialog", { name: "Recognize text" }).getByRole("status")).toHaveText("No new scanned pages with words were found.", { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test("the library search looks inside recognized pages too", async ({ page, isMobile }) => {
  test.skip(isMobile, "the same code; once is enough for the long recognition");
  await openScan(page);
  const sheet = await recognize(page);
  await sheet.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("searchbox").fill("green ledger");
  await page.getByRole("button", { name: "Search the text of every book" }).click();
  const inside = page.getByRole("region", { name: "Inside the books" });
  await expect(inside.getByText("1 match")).toBeVisible({ timeout: 30_000 });
  await expect(inside.locator("mark")).toHaveText("green ledger");
});
