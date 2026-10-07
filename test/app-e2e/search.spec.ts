import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

// The page number is hidden behind the search bar while searching, but it keeps counting.
const expectPage = (page: import("@playwright/test").Page, n: number) => expect(page.locator(".page-now")).toHaveText(String(n));

test("search in the book: count, marks on the page, next and previous, across pages", async ({ page, isMobile }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Search in book" }).click();
  const bar = page.getByRole("search", { name: "Search in book" });
  const box = bar.getByRole("searchbox", { name: "Search in book" });
  await expect(box).toBeFocused();

  await box.fill("dark");
  // "Smart Dark PDF sample", "a dark page" on page 1; nothing is missed because of capitals.
  await expect(bar.getByRole("status")).toHaveText(/^1 of \d+$/);
  const total = Number((await bar.getByRole("status").innerText()).split(" of ")[1]);
  expect(total).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.page[data-page="1"] .found')).not.toHaveCount(0);
  await expect(page.locator(".found.is-current")).toHaveCount(1);
  await page.screenshot({ path: `test/output/search-${test.info().project.name}.png` });

  // The mark sits on the word it marks.
  const mark = (await page.locator(".found.is-current").boundingBox())!;
  const word = await page.evaluate(([x, y]) => {
    const range = document.caretRangeFromPoint?.(x, y) ?? null;
    return range?.startContainer.textContent ?? "";
  }, [mark.x + mark.width / 2, mark.y + mark.height / 2]);
  expect(word.toLowerCase()).toContain("dark");

  await bar.getByRole("button", { name: "Next match" }).click();
  await expect(bar.getByRole("status")).toHaveText(`2 of ${total}`);
  await bar.getByRole("button", { name: "Previous match" }).click();
  await bar.getByRole("button", { name: "Previous match" }).click();
  await expect(bar.getByRole("status")).toHaveText(`${total} of ${total}`); // wraps around

  // A phrase that is only on page two takes the reader there.
  await box.fill("render lazily");
  await expect(bar.getByRole("status")).toHaveText("1 of 1");
  await expectPage(page, 2);
  await expect(page.locator('.page[data-page="2"] .found.is-current')).not.toHaveCount(0);

  await box.fill("zebra crossing");
  await expect(bar.getByRole("status")).toHaveText("No matches");
  await expect(page.locator(".found")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Next match" })).toBeDisabled();

  if (!isMobile) {
    await box.press("Escape");
    await expect(bar).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+F");
    await expect(page.getByRole("searchbox", { name: "Search in book" })).toBeFocused();
    await page.getByRole("searchbox", { name: "Search in book" }).fill("region");
    await expect(page.getByRole("search").getByRole("status")).toHaveText(/^1 of \d+$/);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("search").getByRole("status")).toHaveText(/^2 of \d+$/);
    await page.keyboard.press("Shift+Enter");
    await expect(page.getByRole("search").getByRole("status")).toHaveText(/^1 of \d+$/);
  }
  await page.getByRole("search").getByRole("button", { name: "Close search" }).click();
  await expect(page.locator(".found")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Go to page/ })).toBeVisible(); // the page and zoom controls are back
});

test("the list of matches shows each one with its page and jumps to it", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Search in book" }).click();
  const bar = page.getByRole("search", { name: "Search in book" });
  await bar.getByRole("searchbox").fill("the");
  await expect(bar.getByRole("status")).toHaveText(/^1 of \d+$/);
  await bar.getByRole("button", { name: "List of matches" }).click();
  const rows = bar.getByRole("list", { name: "Matches" }).getByRole("listitem");
  const total = Number((await bar.getByRole("status").innerText()).split(" of ")[1]);
  await expect(rows).toHaveCount(total);
  await expect(rows.first()).toContainText("Page 1");
  await expect(rows.first().locator("mark")).toHaveText(/the/i);
  await page.screenshot({ path: `test/output/search-list-${test.info().project.name}.png` });

  const last = rows.last();
  await expect(last).toContainText("Page 2");
  await last.getByRole("button").click();
  await expect(bar.getByRole("status")).toHaveText(`${total} of ${total}`);
  await expectPage(page, 2);
  await expect(last.getByRole("button")).toHaveAttribute("aria-current", "true");
});

test("search marks stay on their words after zooming", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Search in book" }).click();
  await page.getByRole("searchbox", { name: "Search in book" }).fill("Quarterly Reading Report");
  await expect(page.locator(".found.is-current")).not.toHaveCount(0);
  const before = (await page.locator(".found.is-current").first().boundingBox())!;
  await page.getByRole("search").getByRole("button", { name: "Close search" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Search in book" }).click();
  await expect(page.getByRole("searchbox", { name: "Search in book" })).toHaveValue("Quarterly Reading Report"); // the last search is kept
  await expect.poll(async () => (await page.locator(".found.is-current").first().boundingBox())?.width ?? 0).toBeGreaterThan(before.width * 1.1);
});
