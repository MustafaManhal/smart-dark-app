import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { expectPage } from "./helpers/reader";

async function select(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const range = document.createRange();
    range.setStart(node, node.textContent!.indexOf(t));
    range.setEnd(node, node.textContent!.indexOf(t) + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);
}

/** Two books, each with something marked in it. */
async function twoMarkedBooks(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/links.pdf"]);
  const books = page.getByRole("list", { name: "Books" });
  await expect(books.getByRole("listitem")).toHaveCount(2);

  await books.getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await select(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(page.locator(".selection-bar")).toHaveCount(0); // the bar of that selection is gone before the next one
  await select(page, "Black body text");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".sel-action").last().click();
  await page.locator(".pop-title").fill("Check");
  await page.locator(".pop-note textarea").fill("Ask about the walrus.");
  await page.locator(".pop-actions .btn-primary").click();
  await expect(page.locator(".pop-note")).toBeHidden();
  await page.getByRole("button", { name: "Back to library" }).click();

  await books.getByText("Links sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await select(page, "See the results table");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").nth(2).click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(page.locator(".selection-bar")).toHaveCount(0); // the bar of that selection is gone before the next one
  await page.getByRole("button", { name: "Back to library" }).click();
}

test("the notebook collects the marks of every book, filters them, and opens a mark in its book", async ({ page }) => {
  await twoMarkedBooks(page);
  await page.getByRole("button", { name: "Notebook" }).click();
  await expect(page.getByRole("heading", { name: "Notebook" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("3 entries");
  const sample = page.getByRole("region", { name: "Reader343 sample" });
  await expect(sample.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("region", { name: "Links sample" }).getByRole("listitem")).toHaveCount(1);
  await expect(sample).toContainText("Ask about the walrus.");
  await page.screenshot({ path: `test/output/notebook-${test.info().project.name}.png` });

  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("1 entry");
  await page.getByRole("tab", { name: "All" }).click();
  await page.getByRole("searchbox").fill("results");
  await expect(page.getByRole("status")).toHaveText("1 entry");
  await expect(page.getByRole("region", { name: "Reader343 sample" })).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  await page.locator(".sort select").first().selectOption({ label: "Reader343 sample" });
  await expect(page.getByRole("status")).toHaveText("2 entries");
  await page.locator(".sort select").first().selectOption({ label: "All books" });
  await page.locator(".sort select").nth(1).selectOption({ label: "Newest first" });
  await expect(page.locator(".note-card").first()).toContainText("Links sample"); // marked last

  await page.locator(".note-card", { hasText: "Ask about the walrus." }).click();
  await expectPage(page, 1);
  await expect(page.locator(".reader-title strong")).toHaveText("Reader343 sample");
});

test("the notebook exports what is shown as Markdown, a spreadsheet or Anki cards", async ({ page, isMobile }) => {
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  await twoMarkedBooks(page);
  await page.goto("./#/notes");
  await page.getByRole("button", { name: "Export" }).click();
  const sheet = page.getByRole("dialog", { name: "Export" });
  await expect(sheet).toContainText("3 entries, as they are filtered now.");
  const save = async (name: RegExp) => {
    const download = page.waitForEvent("download");
    await sheet.getByRole("button", { name }).click();
    const file = await download;
    const path = test.info().outputPath(file.suggestedFilename());
    await file.saveAs(path);
    return { name: file.suggestedFilename(), text: readFileSync(path, "utf8") };
  };
  const csv = await save(/^Spreadsheet/);
  expect(csv.name).toBe("Notebook.csv");
  expect(csv.text).toContain("Book,Author,Page,Kind");
  expect(csv.text).toContain("Reader343 sample,,1,Note,,Check,Black body text,Ask about the walrus.");
  await page.getByRole("button", { name: "Export" }).click();
  const anki = await save(/^Anki cards/);
  expect(anki.name).toBe("Notebook.txt");
  expect(anki.text).toContain("See the results table\t<i>Links sample, p. 1</i>\tReader343 Links_sample");
  await page.getByRole("button", { name: "Export" }).click();
  const md = await save(/^Markdown/);
  expect(md.text).toContain("# Links sample");
  expect(md.text).toContain("“colored words keep their hue”");
});

test("an empty notebook says what it is for, and fits a small phone in Arabic", async ({ page, isMobile }) => {
  test.skip(isMobile, "sets its own size");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./#/notes");
  await expect(page.getByRole("heading", { name: "Nothing marked yet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();
  await twoMarkedBooks(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).check();
  await page.goto("./#/notes");
  await expect(page.getByRole("heading", { name: "دفتر الملاحظات" })).toBeVisible();
  await expect(page.locator(".note-card")).toHaveCount(3);
  const wide = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    out: [...document.querySelectorAll<HTMLElement>(".notebook *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${el.className}`),
  }));
  expect(wide).toEqual({ page: 0, out: [] });
  await page.screenshot({ path: "test/output/notebook-ar-320.png" });
});
