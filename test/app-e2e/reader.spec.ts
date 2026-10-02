import { expect, test, type Page } from "@playwright/test";

async function importSample(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
}

const cornerPixel = (page: Page) =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));

test("opens in smart dark, switches to sepia and original", async ({ page }) => {
  await importSample(page);
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  expect((await cornerPixel(page)).every((v) => v < 60)).toBe(true);
  await page.screenshot({ path: `test/output/reader-dark-${test.info().project.name}.png` });

  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("radio", { name: "Sepia" }).check();
  await expect.poll(async () => (await cornerPixel(page))[0]).toBeGreaterThan(220);
  await page.getByRole("radio", { name: "Original" }).check();
  await expect.poll(async () => (await cornerPixel(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
});

test("remembers the page after leaving and reopening", async ({ page }) => {
  await importSample(page);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.waitForTimeout(800); // progress is saved after scrolling settles
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("progressbar", { name: /% read/ })).not.toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
});
