import { expect, test, type Page } from "@playwright/test";
import { expectPage, openSample } from "./helpers/reader";

const scrollTop = (page: Page) => page.locator(".reader-scroll").evaluate((el) => el.scrollTop);
const palette = (page: Page) => page.getByRole("dialog", { name: "Commands" });

async function openMenu(page: Page) {
  await page.getByRole("button", { name: "Book menu" }).click();
  return page.getByRole("dialog", { name: "Book menu" });
}

test("the command list runs actions, chapters and page numbers from the keyboard", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard; the phone opens the list from the book menu");
  await openSample(page);
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page)).toBeVisible();
  const field = palette(page).getByRole("combobox");
  await expect(field).toBeFocused();
  await field.fill("two pag");
  await expect(palette(page).getByRole("option").first()).toHaveText("Layout: Two pages");
  await page.keyboard.press("Enter");
  await expect(palette(page)).toBeHidden();
  await expect(page.locator(".pages")).toHaveClass(/is-spread/);

  await page.keyboard.press("ControlOrMeta+k");
  await field.fill("scrolling");
  await page.keyboard.press("Enter");
  await expect(page.locator(".pages")).not.toHaveClass(/is-spread/);

  // A number is a page; a chapter name is a place.
  await page.keyboard.press("ControlOrMeta+k");
  await field.fill("2");
  await expect(palette(page).getByRole("option").first()).toHaveText("Go to page 2");
  await page.keyboard.press("Enter");
  await expectPage(page, 2);
  await page.keyboard.press("ControlOrMeta+k");
  await field.fill("quarterly");
  await expect(palette(page).getByRole("option").first()).toContainText("Quarterly report");
  await expect(palette(page).getByRole("option").first()).toContainText("Page 1");
  await page.keyboard.press("Enter");
  await expectPage(page, 1);

  // Arrows move through the list; Escape closes it without doing anything.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(palette(page).getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown");
  await expect(palette(page).getByRole("option").nth(1)).toHaveAttribute("aria-selected", "true");
  await field.fill("zzzz");
  await expect(palette(page).getByText("No command found")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expectPage(page, 1);
});

test("the book menu opens the command list, and a tap runs a command", async ({ page }) => {
  await openSample(page);
  await (await openMenu(page)).getByRole("button", { name: /^Find a command/ }).click();
  await expect(palette(page)).toBeVisible();
  await expect(palette(page)).toBeInViewport({ ratio: 1 });
  await palette(page).getByRole("combobox").fill("fit page");
  await palette(page).getByRole("option", { name: "Fit page" }).click();
  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Fit page" })).toHaveAttribute("aria-pressed", "true");
});

test("keys: ? lists the shortcuts, B bookmarks, G asks for a page", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await openSample(page);
  await page.keyboard.press("?");
  const sheet = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Find a command")).toBeVisible();
  await expect(sheet.getByText("Auto-scroll")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect((await openMenu(page)).getByRole("button", { name: /^Keyboard shortcuts/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("b");
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toBeVisible();
  await page.keyboard.press("b");
  await expect(page.getByRole("button", { name: "Bookmark this page" })).toBeVisible();
  await page.keyboard.press("g");
  await expect(page.getByRole("dialog", { name: "Go to page" })).toBeVisible();
});

test("a phone has no keyboard shortcuts entry", async ({ page, isMobile }) => {
  test.skip(!isMobile, "touch screens only");
  await openSample(page);
  const menu = await openMenu(page);
  await expect(menu.getByRole("button", { name: /^Auto-scroll/ })).toBeVisible();
  await expect(menu.getByRole("button", { name: /^Keyboard shortcuts/ })).toHaveCount(0);
});

test("auto-scroll moves the pages, holds, changes speed and stops", async ({ page, isMobile }) => {
  await openSample(page);
  await (await openMenu(page)).getByRole("button", { name: /^Auto-scroll/ }).click();
  const bar = page.getByRole("region", { name: "Auto-scroll" });
  await expect(bar).toBeVisible();
  await expect(bar).toBeInViewport({ ratio: 1 });
  const start = await scrollTop(page);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(start + 15);

  await bar.getByRole("button", { name: "Pause auto-scroll" }).click();
  await page.waitForTimeout(150); // the movement ends with the next drawn frame
  const held = await scrollTop(page);
  await page.waitForTimeout(400);
  expect(await scrollTop(page)).toBe(held);

  // Faster: the number goes up, the pages move quicker, and the speed is remembered.
  await expect(bar.getByRole("status")).toHaveText("4");
  for (let i = 0; i < 4; i++) await bar.getByRole("button", { name: "Faster" }).click();
  await expect(bar.getByRole("status")).toHaveText("8");
  await bar.getByRole("button", { name: "Continue auto-scroll" }).click();
  await page.waitForTimeout(500);
  expect(await scrollTop(page)).toBeGreaterThan(held + 20);

  // The reader can still scroll; the movement goes on from there.
  await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = 30; });
  await page.waitForTimeout(300);
  const after = await scrollTop(page);
  expect(after).toBeGreaterThan(30);
  expect(after).toBeLessThan(140);

  if (!isMobile) {
    await page.keyboard.press("Space");
    await expect(bar.getByRole("button", { name: "Continue auto-scroll" })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(bar.getByRole("button", { name: "Pause auto-scroll" })).toBeVisible();
  }
  // At the end of the book it stops by itself.
  await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(bar.getByRole("button", { name: "Continue auto-scroll" })).toBeVisible();

  await bar.getByRole("button", { name: "Stop auto-scroll" }).click();
  await expect(bar).toBeHidden();
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await (await openMenu(page)).getByRole("button", { name: /^Auto-scroll/ }).click();
  await expect(page.getByRole("region", { name: "Auto-scroll" }).getByRole("status")).toHaveText("8");
});

test("auto-scroll and read aloud do not run together", async ({ page }) => {
  await openSample(page);
  await (await openMenu(page)).getByRole("button", { name: /^Auto-scroll/ }).click();
  await expect(page.getByRole("region", { name: "Auto-scroll" })).toBeVisible();
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect(page.getByRole("region", { name: "Read aloud" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Auto-scroll" })).toHaveCount(0);
  await (await openMenu(page)).getByRole("button", { name: /^Auto-scroll/ }).click();
  await expect(page.getByRole("region", { name: "Auto-scroll" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Read aloud" })).toHaveCount(0);
});
