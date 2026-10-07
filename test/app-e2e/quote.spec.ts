import { statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

async function openQuote(page: Page) {
  await openSample(page);
  await page.locator(".textLayer span", { hasText: "colored words keep their hue" }).first().evaluate((span) => {
    const node = span.firstChild!;
    const t = "colored words keep their hue";
    const range = document.createRange();
    range.setStart(node, node.textContent!.indexOf(t));
    range.setEnd(node, node.textContent!.indexOf(t) + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  const box = (await page.locator('.page[data-page="1"] .hl').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByRole("dialog", { name: "Highlight" }).getByRole("button", { name: "Share as a quote" }).click();
  return page.getByRole("dialog", { name: "Share a quote" });
}

/** Colors on the picture: its corner (the ground) and how many pixels are not ground. */
const picture = (page: Page) => page.locator(".quote-view canvas").evaluate((canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const ground = [data[0], data[1], data[2]];
  let ink = 0;
  for (let i = 0; i < data.length; i += 16) {
    if (Math.abs(data[i] - ground[0]) + Math.abs(data[i + 1] - ground[1]) + Math.abs(data[i + 2] - ground[2]) > 60) ink++;
  }
  return { ground, ink, width: canvas.width, height: canvas.height };
});

test("a marked passage becomes a picture with the book and the page", async ({ page }) => {
  const sheet = await openQuote(page);
  const canvas = sheet.getByRole("img");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAccessibleName("“colored words keep their hue”\nReader343 sample, page 1");
  const paper = await picture(page);
  expect(paper.width).toBe(1080);
  expect(paper.height).toBeGreaterThanOrEqual(1080);
  expect(paper.ink).toBeGreaterThan(1500); // the words, the mark and the footer are drawn
  expect(paper.ground[0]).toBeGreaterThan(220); // light paper
  await page.screenshot({ path: `test/output/quote-${test.info().project.name}.png` });

  await sheet.getByRole("radio", { name: "Night" }).check({ force: true });
  await expect.poll(async () => (await picture(page)).ground[0]).toBeLessThan(40);
  await sheet.getByRole("radio", { name: "Ink" }).check({ force: true });
  await expect.poll(async () => (await picture(page)).ground[2]).toBeGreaterThan(150);
  expect((await picture(page)).ink).toBeGreaterThan(1500);
});

test("the quote can be copied as text or saved as a picture", async ({ page, context, browserName, isMobile }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const sheet = await openQuote(page);
  await sheet.getByRole("button", { name: "Copy as text" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Copied");
  if (browserName === "chromium") {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("“colored words keep their hue”\nReader343 sample, page 1");
  }
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  const download = page.waitForEvent("download");
  await sheet.getByRole("button", { name: "Save picture" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Reader343 sample p1.png");
  const path = test.info().outputPath("quote.png");
  await file.saveAs(path);
  expect(statSync(path).size).toBeGreaterThan(10_000);
  await expect(sheet.getByRole("status")).toHaveText("Picture saved");
});
