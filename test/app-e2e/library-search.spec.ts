import { expect, test, type Page } from "@playwright/test";
import { expectPage } from "./helpers/reader";

const list = (page: Page) => page.getByRole("list", { name: "Books" });

async function addBooks(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/links.pdf"]);
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
}

test("the library search finds a note and opens its book at the page", async ({ page }) => {
  await addBooks(page);
  await list(page).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.locator(".textLayer span", { hasText: "Black body text" }).first().evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".sel-action").last().click();
  await page.locator(".pop-note textarea").fill("Ask the teacher about the walrus.");
  await page.locator(".pop-actions .btn-primary").click();
  await expect(page.locator(".pop-note")).toBeHidden();
  await page.getByRole("button", { name: "Back to library" }).click();

  await page.getByRole("searchbox").fill("WALRUS");
  await expect(page.getByText("No title, author or tag matches.")).toBeVisible();
  const notes = page.getByRole("region", { name: "In your notes and highlights" });
  await expect(notes.getByRole("button")).toHaveCount(1);
  await expect(notes.getByRole("button")).toContainText("Reader343 sample");
  await expect(notes.getByRole("button")).toContainText("Page 1");
  await expect(notes.locator("mark")).toHaveText("walrus");
  // The passage the note is on is found too.
  await page.getByRole("searchbox").fill("black body");
  await expect(notes.locator("mark")).toHaveText("Black body");
  await page.screenshot({ path: `test/output/library-search-${test.info().project.name}.png` });
  await notes.getByRole("button").click();
  await expectPage(page, 1);
});

test("the text of every book is searched on request, and a hit opens the book on those words", async ({ page }) => {
  await addBooks(page);
  await page.getByRole("searchbox").fill("glossary");
  const inside = page.getByRole("region", { name: "Inside the books" });
  await expect(page.getByRole("region", { name: "In your notes and highlights" })).toHaveCount(0);
  await inside.getByRole("button", { name: "Search the text of every book" }).click();
  await expect(inside.getByText("2 matches")).toBeVisible();
  await expect(inside.getByText("Links sample")).toBeVisible();
  await expect(inside.locator("mark").first()).toHaveText("glossary");
  await expect(inside.getByRole("button")).toHaveCount(2);
  await page.screenshot({ path: `test/output/library-inside-${test.info().project.name}.png` });

  await inside.getByRole("button").nth(1).click(); // the one on page 2
  // The book opens with the same words in its search bar, at the match on page 2.
  await expect(page.locator(".search-row input")).toHaveValue("glossary");
  await expect(page.locator('.page[data-page="2"] .search-layer .found.is-current')).toBeInViewport();
  await page.locator(".search-row .icon-btn").last().click(); // close the search: the page number is back
  await expectPage(page, 2);

  // Words that are in no book.
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("searchbox").fill("xylophone quartz");
  await page.getByRole("region", { name: "Inside the books" }).getByRole("button", { name: "Search the text of every book" }).click();
  await expect(page.getByText("Not found inside any book.")).toBeVisible();
  // Another query starts clean.
  await page.getByRole("searchbox").fill("quarterly");
  await expect(page.getByText("Not found inside any book.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search the text of every book" })).toBeVisible();
});

test("search results fit a small phone", async ({ page, isMobile }) => {
  test.skip(isMobile, "sets its own size");
  await page.setViewportSize({ width: 320, height: 700 });
  await addBooks(page);
  await page.getByRole("searchbox").fill("the");
  await page.getByRole("button", { name: "Search the text of every book" }).click();
  await expect(page.getByRole("region", { name: "Inside the books" }).locator("mark").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Search the text of every book" })).toHaveCount(0);
  const wide = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    out: [...document.querySelectorAll<HTMLElement>(".library *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(wide).toEqual({ page: 0, out: [] });
  await page.screenshot({ path: "test/output/library-inside-320.png", fullPage: true });
});
