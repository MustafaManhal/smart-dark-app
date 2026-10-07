import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

async function selectText(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);
}
const mark = (page: Page) => page.locator('.page[data-page="1"] .hl').first();
async function openMenu(page: Page) {
  const box = (await mark(page).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return page.getByRole("dialog", { name: "Highlight" });
}
/** The line a mark draws: how thick it is and where it sits in the mark's box (0 top, 1 bottom). */
const lineOf = (page: Page) => mark(page).evaluate((el) => {
  const box = el.getBoundingClientRect();
  const line = getComputedStyle(el, "::after");
  const height = parseFloat(line.height);
  const top = line.top === "auto" ? box.height - parseFloat(line.bottom) - height : parseFloat(line.top);
  return { fill: getComputedStyle(el).backgroundColor, height, middle: (top + height / 2) / box.height };
});

test("a highlight can become an underline or a strikethrough, and back", async ({ page }) => {
  await openSample(page);
  await selectText(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(mark(page)).toHaveClass("hl");

  let menu = await openMenu(page);
  const styles = menu.getByRole("radiogroup", { name: "Mark style" });
  await expect(styles.getByRole("radio", { name: "Highlight" })).toBeChecked();
  await expect(menu).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `test/output/mark-menu-${test.info().project.name}.png` });
  await styles.getByRole("radio", { name: "Underline" }).click();
  await expect(mark(page)).toHaveClass("hl is-underline");
  await expect(styles.getByRole("radio", { name: "Underline" })).toBeChecked();
  const under = await lineOf(page);
  expect(under.fill).toBe("rgba(0, 0, 0, 0)"); // no fill, a line
  expect(under.height).toBeGreaterThanOrEqual(2);
  expect(under.middle).toBeGreaterThan(0.8); // at the foot of the words

  await styles.getByRole("radio", { name: "Strikethrough" }).click();
  await expect(mark(page)).toHaveClass("hl is-strike");
  const strike = await lineOf(page);
  expect(strike.middle).toBeGreaterThan(0.4);
  expect(strike.middle).toBeLessThan(0.65); // through the middle of the words
  await page.screenshot({ path: `test/output/mark-strike-${test.info().project.name}.png` });

  // It is kept, with its color.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(mark(page)).toHaveClass("hl is-strike");
  menu = await openMenu(page);
  await menu.getByRole("radio", { name: "Highlight", exact: true }).click();
  await expect(mark(page)).toHaveClass("hl");
  expect((await lineOf(page)).fill).not.toBe("rgba(0, 0, 0, 0)");
  // Undo brings the strikethrough back.
  await page.locator(".reader-title").click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(mark(page)).toHaveClass("hl is-strike");
});

test("the highlighter tool draws in the style chosen for it; the bar at a selection always highlights", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  const hint = page.locator(".mode-hint");
  await expect(hint).toContainText("Select text to highlight");
  await hint.getByRole("button", { name: "Mark style: Highlight" }).click();
  await expect(hint).toContainText("Select text to underline");
  await expect(hint.getByRole("button", { name: "Mark style: Underline" })).toBeVisible();
  await expect(hint).toBeInViewport({ ratio: 1 });
  await selectText(page, "colored words keep their hue");
  await expect(mark(page)).toHaveClass("hl is-underline");
  await hint.getByRole("button", { name: "Done" }).click();

  // Outside the tool, a color in the bar makes a plain highlight.
  await selectText(page, "Black body text");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").nth(1).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(2);
  await expect(page.locator('.page[data-page="1"] .hl:not(.is-underline)')).toHaveCount(1);

  // The tool remembers its style.
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Highlight text" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to underline");
  await page.locator(".mode-hint").getByRole("button", { name: "Mark style: Underline" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to strike through");
  await page.locator(".mode-hint").getByRole("button", { name: "Mark style: Strikethrough" }).click();
  await expect(page.locator(".mode-hint")).toContainText("Select text to highlight");
});
