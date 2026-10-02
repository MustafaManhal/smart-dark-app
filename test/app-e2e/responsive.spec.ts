import { expect, test, type Page } from "@playwright/test";

// Every screen must fit from small phones (320px) to large desktops (1440px+).
const WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920];

test.skip(({ browserName }) => browserName !== "chromium", "layout sweep runs once, in Chromium");

async function noHorizontalOverflow(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.closest(".page, .chips, .reader-scroll")) continue; // pages and chip rows scroll on purpose
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1)) offenders.push(`${el.tagName.toLowerCase()}.${el.className}`);
    }
    return { scroll: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 5) };
  });
  expect(overflow.scroll, `${where}: page scrolls sideways`).toBeLessThanOrEqual(0);
  expect(overflow.offenders, `${where}: elements outside the screen`).toEqual([]);
}

for (const width of WIDTHS) {
  test(`layout fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 760 : 900 });
    await page.goto("./");
    await noHorizontalOverflow(page, "empty library");

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
    await (await chooser).setFiles("src/sample/sample.pdf");
    await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
    await expect(page.locator(".cover img")).toHaveJSProperty("complete", true);
    await noHorizontalOverflow(page, "library");
    await page.screenshot({ path: `test/output/responsive/library-${width}.png` });

    await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
    await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
    await noHorizontalOverflow(page, "reader");
    for (const name of ["Back to library", "Contents", "Appearance", "Previous page", "Next page"]) {
      await expect(page.getByRole("button", { name })).toBeInViewport();
    }
    await page.screenshot({ path: `test/output/responsive/reader-${width}.png` });

    await page.getByRole("button", { name: "Appearance" }).click();
    await expect(page.getByRole("dialog", { name: "Appearance" })).toBeInViewport();
    await page.waitForTimeout(400); // let the sheet finish sliding in
    await noHorizontalOverflow(page, "appearance sheet");
    await page.screenshot({ path: `test/output/responsive/appearance-${width}.png` });
  });
}
