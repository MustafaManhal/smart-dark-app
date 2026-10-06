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

test("quick zoom chips: percentages, fit page and fit width in one tap", async ({ page }) => {
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

  await chips.getByRole("button", { name: "200%" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("200%");
  await expect(chips.getByRole("button", { name: "200%" })).toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByRole("button", { name: "Fit width" })).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await box()).w).toBeCloseTo(595 * 2 * (96 / 72), -1);

  await chips.getByRole("button", { name: "50%", exact: true }).click();
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
  await chips.getByRole("button", { name: "150%" }).click();
  await expect(page.locator(".zoom-value")).toHaveText("150%");
  await page.waitForTimeout(700); // saved after the zoom settles
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".zoom-value")).toHaveText("150%");
  await expect(chips.getByRole("button", { name: "150%" })).toHaveAttribute("aria-pressed", "true");

  await chips.getByRole("button", { name: "Fit page" }).click();
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(chips.getByRole("button", { name: "Fit page" })).toHaveAttribute("aria-pressed", "true");
});

test("book progress follows the reading position through the whole book", async ({ page }) => {
  await openSample(page);
  const bar = page.getByRole("progressbar", { name: "Book progress" });
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  await goToPage(page, 2);
  await expect.poll(async () => Number(await bar.getAttribute("aria-valuenow"))).toBeGreaterThan(45);
});
