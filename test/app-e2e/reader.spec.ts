import { expect, test, type Page } from "@playwright/test";
import { expectPage, goToPage, openSample } from "./helpers/reader";

const cornerPixel = (page: Page) =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));

const appearance = (page: Page) => page.getByRole("button", { name: "Appearance" }).click();

test("opens in smart dark, switches to sepia and original", async ({ page }) => {
  await openSample(page);
  expect((await cornerPixel(page)).every((v) => v < 60)).toBe(true);
  await page.screenshot({ path: `test/output/reader-dark-${test.info().project.name}.png` });

  await appearance(page);
  await page.getByRole("radio", { name: "Sepia" }).check();
  await expect.poll(async () => (await cornerPixel(page))[0]).toBeGreaterThan(220);
  await page.getByRole("radio", { name: "Original" }).check();
  await expect.poll(async () => (await cornerPixel(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
});

test("remembers the page after leaving and reopening", async ({ page }) => {
  await openSample(page);
  await goToPage(page, 2);
  await page.waitForTimeout(800); // progress is saved after scrolling settles
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("progressbar", { name: /% read/ })).not.toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expectPage(page, 2);
});

test("zoom buttons, keyboard and fit to width", async ({ page }) => {
  await openSample(page);
  const width = () => page.locator('.page[data-page="1"]').evaluate((p) => p.getBoundingClientRect().width);
  const fitted = await width();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(width).toBeGreaterThan(fitted * 1.15);
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect.poll(width).toBeLessThan(fitted * 0.9);
  await expect(page.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Fit width" }).click();
  await expect.poll(width).toBeCloseTo(fitted, 0);
  await expect(page.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "true");
  // Zoomed-in pages re-render sharp, not just stretched.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(() => page.locator('.page[data-page="1"] canvas').evaluate(
    (c: HTMLCanvasElement) => c.width / c.getBoundingClientRect().width)).toBeGreaterThan(0.95);
});

test("pinch to zoom on touch screens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch only");
  await openSample(page);
  const width = () => page.locator('.page[data-page="1"]').evaluate((p) => p.getBoundingClientRect().width);
  const before = await width();
  // Two synthetic touch pointers moving apart.
  await page.locator(".reader-scroll").evaluate((el) => {
    const fire = (type: string, id: number, x: number) =>
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", clientX: x, clientY: 300, bubbles: true }));
    fire("pointerdown", 1, 150); fire("pointerdown", 2, 250);
    fire("pointermove", 1, 100); fire("pointermove", 2, 300);
    fire("pointerup", 1, 100); fire("pointerup", 2, 300);
  });
  await expect.poll(width).toBeGreaterThan(before * 1.8);
});

test("zoom: fit chips in one tap, percentages from the zoom number", async ({ page }) => {
  await openSample(page);
  const box = () => page.locator('.page[data-page="1"]').evaluate((p) => {
    const r = p.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  const chips = page.getByRole("group", { name: "Quick zoom" });
  const scroller = () => page.locator(".reader-scroll").evaluate((s) => ({ w: s.clientWidth, h: s.clientHeight }));

  // A book opens at fit width: the page is as wide as the screen.
  await expect(chips.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "true");
  expect((await box()).w).toBeGreaterThan((await scroller()).w - 30);
  expect((await box()).w).toBeLessThanOrEqual((await scroller()).w);

  // Only the two fit chips; percentages are in the menu behind the zoom number.
  await expect(chips.getByRole("button")).toHaveCount(2);
  await page.getByRole("button", { name: /Zoom options/ }).click();
  await page.getByRole("menuitem", { name: "200%" }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".zoom-value")).toHaveText("200%");
  await expect(chips.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await box()).w).toBeCloseTo(595 * 2 * (96 / 72), -1);

  await page.getByRole("button", { name: /Zoom options/ }).click();
  await expect(page.getByRole("menuitem", { name: "200%" })).toHaveAttribute("aria-current", "true");
  await page.getByRole("menuitem", { name: "50%", exact: true }).click();
  await expect(page.locator(".zoom-value")).toHaveText("50%");
  await expect.poll(async () => (await box()).w).toBeCloseTo(595 * 0.5 * (96 / 72), -1);

  await chips.getByRole("button", { name: "Fit page" }).click();
  await expect(chips.getByRole("button", { name: "Fit page" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => (await box()).h).toBeLessThan((await scroller()).h);
  // The whole page is on screen, below the bars and the floating controls.
  const fit = await page.locator('.page[data-page="1"]').evaluate((p) => p.getBoundingClientRect());
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: `test/output/zoom-chips-${test.info().project.name}.png` });
});

test("the zoom is remembered for the next book", async ({ page }) => {
  await openSample(page);
  const chips = page.getByRole("group", { name: "Quick zoom" });
  await page.getByRole("button", { name: /Zoom options/ }).click();
  await page.getByRole("menuitem", { name: "150%" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("150%");
  await page.waitForTimeout(700); // saved after the zoom settles
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".zoom-value")).toHaveText("150%");

  await chips.getByRole("button", { name: "Fit page" }).click();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(chips.getByRole("button", { name: "Fit page" })).toHaveAttribute("aria-pressed", "true");
});

test("book progress follows the reading position through the whole book", async ({ page }) => {
  await openSample(page);
  const bar = page.getByRole("slider", { name: "Book progress" });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await goToPage(page, 2);
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(45);
});

test("page thumbnails: every page as a small picture, in the page style, one tap to go there", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await page.getByRole("button", { name: /Go to page/ }).click();
  const sheet = page.getByRole("dialog", { name: "Go to page" });
  const thumbs = sheet.getByRole("list", { name: "Pages" }).getByRole("listitem");
  await expect(thumbs).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
  // Pictures arrive, and they are dark like the pages being read.
  await expect(sheet.locator(".thumb-page canvas")).toHaveCount(2);
  const corner = await sheet.locator(".thumb-page canvas").first().evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));
  expect(corner.every((v) => v < 60)).toBe(true);
  await expect(thumbs.first().locator(".thumb-mark.is-bookmark")).toHaveCount(1);
  await expect(thumbs.nth(1).locator(".thumb-mark")).toHaveCount(0);
  await page.screenshot({ path: `test/output/thumbnails-${test.info().project.name}.png` });

  await sheet.getByRole("button", { name: "Page 2", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expectPage(page, 2);
});

test("drag along the progress line to move through the book", async ({ page }) => {
  await openSample(page);
  const line = page.getByRole("slider", { name: "Book progress" });
  await expect(line).toHaveAttribute("aria-valuetext", "Page 1 of 2");
  const box = (await line.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.9, box.y + 4, { steps: 6 });
  await expect(page.locator(".scrub-bubble")).toContainText("Page 2");
  await page.screenshot({ path: `test/output/scrub-${test.info().project.name}.png` });
  await expectPage(page, 1); // nothing moves until the line is let go
  await page.mouse.up();
  await expectPage(page, 2);
  await expect(page.locator(".scrub-bubble")).toHaveCount(0);
  await expect.poll(async () => Number(await line.getAttribute("aria-valuenow"))).toBeGreaterThan(70);
});

test("two-page view puts pages side by side, with a cover option and right-to-left order", async ({ page, isMobile }) => {
  await openSample(page);
  const box = (n: number) => page.locator(`.page[data-page="${n}"]`).boundingBox().then((b) => b!);
  const single = await box(1);
  await page.getByRole("button", { name: "Appearance" }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  await sheet.getByRole("radio", { name: "Two pages" }).check();
  // With the cover option the first page stands alone, so page 2 starts below it.
  await expect(sheet.getByRole("checkbox", { name: "First page alone, like a cover" })).toBeChecked();
  await expect.poll(async () => (await box(2)).y).toBeGreaterThan((await box(1)).y + 50);

  await sheet.getByRole("checkbox", { name: "First page alone, like a cover" }).uncheck();
  await expect.poll(async () => Math.abs((await box(2)).y - (await box(1)).y)).toBeLessThan(2);
  const [left, right] = [await box(1), await box(2)];
  expect(right.x).toBeGreaterThan(left.x + left.width - 1);
  expect(left.width).toBeLessThan(single.width * 0.55); // each page takes half the width
  expect(right.x + right.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator(".page-now")).toHaveText("1"); // of the two pages on screen, the first counts
  await page.screenshot({ path: `test/output/spread-${test.info().project.name}.png` });

  await sheet.getByRole("checkbox", { name: "Pages go right to left" }).check();
  await expect.poll(async () => (await box(1)).x - (await box(2)).x).toBeGreaterThan(50);

  // The choice is kept, and going back to scrolling restores the full width.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect.poll(async () => Math.abs((await box(2)).y - (await box(1)).y)).toBeLessThan(2);
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("radio", { name: "Scrolling" }).check();
  await expect.poll(async () => (await box(1)).width).toBeGreaterThan(single.width - 2);
  if (!isMobile) await expect(page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Full screen" })).toBeVisible();
});

test("page by page: scrolling comes to rest at the top of a page", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Appearance" }).click();
  const sheet = page.getByRole("dialog", { name: "Appearance" });
  await sheet.getByRole("radio", { name: "Page by page" }).check();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".reader-scroll")).toHaveClass(/is-paged/);
  await goToPage(page, 2);
  // Page 2 sits right under the bars and the floating controls.
  const top = await page.locator('.page[data-page="2"]').evaluate((p) => p.getBoundingClientRect().top);
  const expected = await page.locator(".reader-scroll").evaluate((s) => parseFloat(getComputedStyle(s).paddingTop));
  expect(Math.abs(top - expected)).toBeLessThan(4);
});
