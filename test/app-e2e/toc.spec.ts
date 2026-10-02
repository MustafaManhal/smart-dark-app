import { expect, test, type Page } from "@playwright/test";

async function openSample(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
}

test("contents jumps to a chapter and shows chapter progress", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("dialog", { name: "Contents" }).getByRole("button", { name: /Page two/ }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await expect(page.locator(".reader-title span")).toHaveText("Page two");
  await expect(page.getByRole("progressbar", { name: "Chapter progress" })).toHaveAttribute("aria-valuenow", "100");
});

test("keyboard navigation on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await openSample(page);
  await page.locator(".reader-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.keyboard.press("Home");
  await expect(page.getByLabel("Page number")).toHaveValue("1");
  await page.keyboard.press("End");
  await expect(page.getByLabel("Page number")).toHaveValue("2");
});

test("tapping the page hides and shows the bars on touch screens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only");
  await openSample(page);
  await page.locator('.page[data-page="1"]').tap();
  await expect(page.locator(".reader")).toHaveClass(/bars-hidden/);
  await page.locator('.page[data-page="1"]').tap();
  await expect(page.locator(".reader")).not.toHaveClass(/bars-hidden/);
});
