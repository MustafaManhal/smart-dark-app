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

async function clickCenter(page: Page, selector: string) {
  const b = (await page.locator(selector).first().boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test("highlight selected text, recolor it, remove it in one tap", async ({ page }) => {
  await openSample(page);
  await selectText(page, "colored words keep their hue");
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Highlight green" }).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(bar).toBeHidden();

  await page.reload();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await clickCenter(page, '.page[data-page="1"] .hl');
  const pop = page.getByRole("dialog", { name: "Highlight" });
  await expect(pop).toBeVisible();
  await pop.getByRole("radio", { name: "Pink" }).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveAttribute("style", /#f783ac/);
  await page.screenshot({ path: `test/output/highlight-${test.info().project.name}.png` });
  await pop.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(0);
});

test("a note on a passage is separate from highlights", async ({ page }) => {
  await openSample(page);
  await selectText(page, "Black body text");
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Note" }).click();
  const pop = page.getByRole("dialog", { name: "Note" });
  await expect(pop).toContainText("Black body text");
  await pop.getByLabel("Note text").fill("Explain the contrast rule");
  await pop.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('.page[data-page="1"] .pn')).toHaveCount(1);
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: /Open note: Explain the contrast rule/ }).click();
  await expect(page.getByRole("dialog", { name: "Note" }).getByLabel("Note text")).toHaveValue("Explain the contrast rule");
  await page.getByRole("dialog", { name: "Note" }).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator('.page[data-page="1"] .pn')).toHaveCount(0);
});

test("notes panel lists each kind beside the PDF and jumps to it", async ({ page, isMobile }) => {
  await openSample(page);
  await selectText(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Highlight yellow" }).click();
  await goToPage(page, 2);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await page.keyboard.press("Home").catch(() => {});
  await goToPage(page, 1);

  await page.getByRole("button", { name: "Notes and highlights" }).click();
  const panel = page.getByRole("complementary", { name: "Notes and highlights" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("tab", { name: /Highlights 1/ })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Highlights" })).toContainText("colored words keep their hue");
  if (!isMobile) {
    // Wide screens keep the PDF visible next to the panel.
    const panelBox = (await panel.boundingBox())!;
    const pageBox = (await page.locator('.page[data-page="1"]').boundingBox())!;
    expect(pageBox.x + pageBox.width).toBeLessThanOrEqual(panelBox.x + 1);
  }
  await page.waitForTimeout(300); // let the panel finish sliding in
  await page.screenshot({ path: `test/output/panel-${test.info().project.name}.png` });

  await panel.getByRole("tab", { name: /Bookmarks 1/ }).click();
  await panel.getByRole("list", { name: "Bookmarks" }).getByRole("button", { name: /Page 2/ }).click();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveAccessibleName(/^Page 2 of/);

  if (isMobile) await page.getByRole("button", { name: "Notes and highlights" }).click();
  await panel.getByRole("tab", { name: /Highlights 1/ }).click();
  await panel.getByRole("button", { name: "Remove highlight on page 1" }).click();
  await expect(panel.getByText("Select text and pick a color")).toBeVisible();
  await expect(page.locator(".hl")).toHaveCount(0);
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
