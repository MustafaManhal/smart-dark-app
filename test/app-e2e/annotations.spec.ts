import { expect, test, type Page } from "@playwright/test";
import { goToPage, openSample } from "./helpers/reader";

/** Selects the first `words` words of a text-layer span containing `text`. */
async function selectText(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}

test("highlight selected text, add a note, and keep it after reload", async ({ page }) => {
  await openSample(page);
  await selectText(page, "colored words keep their hue");
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Highlight green" }).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(bar).toBeHidden();

  await page.reload();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  // Tap the highlight to open it, recolor and add a note.
  const hl = page.locator('.page[data-page="1"] .hl').first();
  const b = (await hl.boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const sheet = page.getByRole("dialog", { name: "Highlight" });
  await expect(sheet).toContainText("colored words keep their hue");
  await sheet.getByRole("radio", { name: "Pink" }).click();
  await sheet.getByLabel("Note").fill("Check this with the team");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.locator('.page[data-page="1"] .hl.has-note')).toHaveCount(1);
  await page.screenshot({ path: `test/output/highlight-${test.info().project.name}.png` });
});

test("highlight mode highlights a selection straight away", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  await expect(page.getByRole("status")).toContainText("Select text to highlight");
  await page.getByRole("radio", { name: "Blue" }).click();
  await selectText(page, "Black body text");
  await page.locator(".reader-scroll").dispatchEvent("pointerup");
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveAttribute("style", /#74c0fc/);
});

test("sticky note: place, type, drag, collapse, and it stays after reload", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Add sticky note" }).click();
  await expect(page.getByRole("status")).toContainText("Tap the page");
  const pageBox = (await page.locator('.page[data-page="1"]').boundingBox())!;
  await page.mouse.click(pageBox.x + pageBox.width * 0.5, pageBox.y + pageBox.height * 0.3);
  const note = page.getByRole("group", { name: "Sticky note" });
  await expect(note.getByLabel("Sticky note text")).toBeFocused();
  await note.getByLabel("Sticky note text").fill("Ask about chart colors");
  await page.waitForTimeout(600);

  if (!isMobile) {
    const head = (await note.locator(".sticky-head").boundingBox())!;
    await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(head.x + head.width / 2 - 120, head.y + head.height / 2 + 80, { steps: 6 });
    await page.mouse.up();
  }
  const before = (await note.boundingBox())!;
  await page.screenshot({ path: `test/output/sticky-${test.info().project.name}.png` });

  await page.reload();
  const again = page.getByRole("group", { name: "Sticky note" });
  await expect(again.getByLabel("Sticky note text")).toHaveValue("Ask about chart colors");
  const after = (await again.boundingBox())!;
  expect(Math.abs(after.x - before.x)).toBeLessThan(3);
  expect(Math.abs(after.y - before.y)).toBeLessThan(3);

  await again.getByRole("button", { name: "Collapse note" }).click();
  await expect(page.getByRole("button", { name: /Open sticky note: Ask about chart colors/ })).toBeVisible();
});

test("typing in a sticky note does not turn pages", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await openSample(page);
  await page.getByRole("button", { name: "Add sticky note" }).click();
  const pageBox = (await page.locator('.page[data-page="1"]').boundingBox())!;
  await page.mouse.click(pageBox.x + 100, pageBox.y + 200);
  await page.keyboard.type("jk end");
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveAccessibleName(/^Page 1 of/);
});

test("bookmark the current page", async ({ page }) => {
  await openSample(page);
  await goToPage(page, 2);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.page[data-page="2"]')).toHaveClass(/is-bookmarked/);
  await page.reload();
  await expect(page.locator('.page[data-page="2"]')).toHaveClass(/is-bookmarked/);
});
