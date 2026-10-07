import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { expect, test } from "@playwright/test";
import { expectPage, goToPage } from "./helpers/reader";

// How the reader holds up with a long book: 1,000 pages of text. The limits are several times what a
// good run takes, so the test fails when something becomes slow by a different order, not by a little.
test.skip(({ browserName }) => browserName !== "chromium", "timed in one browser");

async function thousandPages() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 1000; n++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${n} of the long book`, { x: 60, y: 780, size: 18, font });
    for (let line = 0; line < 30; line++) page.drawText(`Line ${line + 1} on page ${n}: the quick brown fox jumps over the lazy dog.`, { x: 60, y: 740 - line * 22, size: 11, font });
  }
  doc.setTitle("A Thousand Pages");
  return Buffer.from(await doc.save());
}

test("a 1,000-page book is added, opened, jumped through and searched without long waits", async ({ page }) => {
  test.setTimeout(120_000);
  const file = await thousandPages();
  await page.goto("./");
  const timed = async (what: string, limit: number, run: () => Promise<unknown>) => {
    const start = Date.now();
    await run();
    const took = Date.now() - start;
    test.info().annotations.push({ type: "time", description: `${what}: ${took} ms (limit ${limit})` });
    console.log(`${what}: ${took} ms`);
    expect(took, what).toBeLessThan(limit);
  };

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await timed("add to the library", 15_000, async () => {
    await (await chooser).setFiles({ name: "thousand.pdf", mimeType: "application/pdf", buffer: file });
    await expect(page.getByRole("list", { name: "Books" }).getByText("A Thousand Pages")).toBeVisible({ timeout: 15_000 });
  });
  await timed("open the book and draw page 1", 8_000, async () => {
    await page.getByRole("list", { name: "Books" }).getByText("A Thousand Pages").click();
    await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 8_000 });
  });
  await expectPage(page, 1);
  // Only the pages near the screen are drawn: a thousand canvases would use up a phone's memory.
  expect(await page.locator(".page canvas").count()).toBeLessThan(12);

  await timed("jump to page 900 and draw it", 6_000, async () => {
    await goToPage(page, 900);
    await expect(page.locator('.page[data-page="900"] canvas')).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('.page[data-page="900"] .textLayer span').first()).toBeAttached({ timeout: 6_000 });
  });
  expect(await page.locator(".page canvas").count()).toBeLessThan(12);

  await timed("scroll on through twenty pages", 10_000, async () => {
    await page.locator(".reader-scroll").evaluate((el) => el.scrollBy({ top: el.clientHeight * 20 }));
    await expect.poll(async () => Number((await page.getByRole("button", { name: /Go to page/ }).getAttribute("aria-label"))!.match(/Page (\d+)/)![1]), { timeout: 10_000 }).toBeGreaterThan(905);
  });

  await timed("find a phrase that is on one page only", 40_000, async () => {
    await page.locator(".top-search").click();
    await page.locator(".search-row input").fill("Line 7 on page 777:");
    await expect(page.locator(".search-row")).toContainText(/1\s*(\/|of)\s*1/, { timeout: 40_000 });
  });
});
