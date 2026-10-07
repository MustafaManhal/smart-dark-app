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

test("a book without contents gets them from its headings", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/headings.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Headings sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  const contents = page.getByRole("button", { name: "Contents" });
  await expect(contents).toBeEnabled();
  await contents.click();
  const panel = page.getByRole("complementary", { name: "Contents" });
  await expect(panel.getByText("Made from the headings of this book.")).toBeVisible();
  await expect(panel.locator(".toc button")).toHaveCount(5);
  await expect(panel.locator(".toc button").first()).toContainText("1 Why the sea moves");
  // The chapter shows under the title, and a section jumps to its page.
  await expect(page.locator(".reader-title span")).toHaveText("1 Why the sea moves");
  await panel.getByRole("button", { name: /2\.1 High and low water/ }).click();
  await expectPage(page, 3);
  // Kept with the book: there at once after a reload.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("button", { name: "Contents" })).toBeEnabled();
});
