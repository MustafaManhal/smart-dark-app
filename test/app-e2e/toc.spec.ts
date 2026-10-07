import { expect, test } from "@playwright/test";
import { expectPage, openSample } from "./helpers/reader";

test("contents jumps to a chapter and shows chapter progress", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("complementary", { name: "Contents" }).getByRole("button", { name: /Page two/ }).click();
  await expectPage(page, 2);
  await expect(page.locator(".reader-title span")).toHaveText("Page two");
  await expect.poll(async () => Number(await page.getByRole("slider", { name: "Book progress" }).getAttribute("aria-valuenow"))).toBeGreaterThan(45);
});

test("keyboard navigation on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await openSample(page);
  await page.locator(".reader-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expectPage(page, 2);
  await page.keyboard.press("Home");
  await expectPage(page, 1);
  await page.keyboard.press("End");
  await expectPage(page, 2);
});

test("tapping the page hides and shows the bars on touch screens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only");
  await openSample(page);
  await page.locator('.page[data-page="1"]').tap({ position: { x: 20, y: 300 } });
  await expect(page.locator(".reader")).toHaveClass(/bars-hidden/);
  await page.locator('.page[data-page="1"]').tap({ position: { x: 20, y: 300 } });
  await expect(page.locator(".reader")).not.toHaveClass(/bars-hidden/);
});
