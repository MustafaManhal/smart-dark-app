import { expect, test } from "@playwright/test";
test("resume restores the exact scroll position within a page", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toBeEnabled();
  const parentIsScroller = await page.locator('.page[data-page="1"]').evaluate((p: HTMLElement) => !!p.offsetParent?.classList.contains("reader-scroll"));
  expect(parentIsScroller).toBe(true);
  // Scroll partway into the document (clamped to what the screen size allows).
  const before = await page.locator(".reader-scroll").evaluate((s) => {
    s.scrollTop = Math.min(700, (s.scrollHeight - s.clientHeight) * 0.8);
    s.dispatchEvent(new Event("scroll"));
    return s.scrollTop;
  });
  await page.waitForTimeout(700);
  await page.reload();
  await expect.poll(() => page.locator(".reader-scroll").evaluate((s) => s.scrollTop)).toBeGreaterThan(before - 3);
  expect(await page.locator(".reader-scroll").evaluate((s) => s.scrollTop)).toBeLessThan(before + 3);
});
