import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PDFDocument } from "@cantoo/pdf-lib";
import { unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";

// A PNG of one dot, for "pictures to PDF".
const DOT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const tiles = (page: Page) => page.locator(".tool-page");
const names = (page: Page) => page.locator(".tool-cap small").allTextContents();

async function openTools(page: Page, files: (string | { name: string; mimeType: string; buffer: Buffer })[]) {
  await page.goto("./");
  await page.getByRole("button", { name: "PDF tools" }).click();
  await expect(page.getByRole("heading", { name: "Make a new PDF from pages" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDFs or pictures" }).click();
  await (await chooser).setFiles(files.map((f) => (typeof f === "string" ? { name: basename(f), mimeType: "application/pdf", buffer: readFileSync(f) } : f)));
}

/** On the phone a file is saved through the share sheet, which a test cannot press: the sheet is replaced by a catcher. */
test.beforeEach(async ({ page, isMobile }) => {
  if (!isMobile) return;
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: async (data: { files: File[] }) => { (window as never as { shared: File }).shared = data.files[0]; }, configurable: true });
  });
});

async function saved(page: Page, isMobile: boolean, press: () => Promise<void>) {
  if (isMobile) {
    await press();
    const handle = await page.waitForFunction(() => (window as never as { shared?: File }).shared);
    return handle.evaluate(async (file) => {
      const bytes = new Uint8Array(await file!.arrayBuffer());
      let text = "";
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { name: file!.name, data: btoa(text) };
    }).then((f) => ({ name: f.name, bytes: Buffer.from(f.data, "base64") }));
  }
  const download = page.waitForEvent("download");
  await press();
  const file = await download;
  const path = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(path);
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

async function make(page: Page, save = true) {
  const sheet = page.getByRole("dialog", { name: "Make PDF" });
  await sheet.getByRole("button", { name: "Make PDF" }).click();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  if (!save) return { name: "", bytes: Buffer.alloc(0) };
  return saved(page, !!test.info().project.use.isMobile, () => sheet.getByRole("button", { name: "Save" }).click());
}

test("two PDFs and a picture become one PDF, moved, turned and thinned out", async ({ page }) => {
  await openTools(page, ["src/sample/sample.pdf", "test/fixtures/links.pdf", { name: "dot.png", mimeType: "image/png", buffer: DOT }]);
  await expect(tiles(page)).toHaveCount(6);
  await expect(page.locator(".tools-count")).toHaveText("6 pages");
  await expect(page.locator(".tool-thumb img").first()).toBeVisible(); // the small pictures are drawn
  expect(await names(page)).toEqual(["sample.pdf · 1", "sample.pdf · 2", "links.pdf · 1", "links.pdf · 2", "links.pdf · 3", "dot.png"]);
  // Nothing is chosen: the actions wait.
  await expect(page.getByRole("button", { name: "Remove pages" })).toBeDisabled();

  // The picture goes to the front, one place at a time.
  await page.getByRole("button", { name: "Page 6: dot.png" }).click();
  await expect(page.locator(".tools-count")).toHaveText("1 of 6 pages chosen");
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Move earlier" }).click();
  expect((await names(page))[0]).toBe("dot.png");
  await expect(page.getByRole("button", { name: "Page 1: dot.png" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Page 1: dot.png" }).click();

  // The second page of the sample is turned, the last two of the links book are removed.
  await page.getByRole("button", { name: "Page 3: sample.pdf, Page 2" }).click();
  await page.getByRole("button", { name: "Rotate right" }).click();
  await expect(page.locator(".tool-page").nth(2).locator("img")).toHaveAttribute("style", /rotate\(90deg\)/);
  await page.getByRole("button", { name: "Page 3: sample.pdf, Page 2" }).click();
  await page.getByRole("button", { name: "Page 5: links.pdf, Page 2" }).click();
  await page.getByRole("button", { name: "Page 6: links.pdf, Page 3" }).click();
  await page.getByRole("button", { name: "Remove pages" }).click();
  await expect(tiles(page)).toHaveCount(4);
  // One step back and forth: undo brings them back, removing again takes them out.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tiles(page)).toHaveCount(6);
  await page.getByRole("button", { name: "Page 5: links.pdf, Page 2" }).click();
  await page.getByRole("button", { name: "Page 6: links.pdf, Page 3" }).click();
  await page.getByRole("button", { name: "Remove pages" }).click();
  await expect(tiles(page)).toHaveCount(4);

  await page.getByRole("button", { name: "Make PDF" }).click();
  const sheet = page.getByRole("dialog", { name: "Make PDF" });
  await expect(sheet.getByLabel("Name")).toHaveValue("sample + links + 1");
  await sheet.getByLabel("Name").fill("Joined");
  const { name, bytes } = await make(page);
  expect(name).toBe("Joined.pdf");
  await expect(sheet).toContainText("4 pages");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getTitle()).toBe("Joined");
  expect(doc.getPageCount()).toBe(4);
  expect(doc.getPages().map((p) => p.getRotation().angle)).toEqual([0, 0, 90, 0]);
  expect(doc.getPage(0).getSize()).toEqual({ width: 1, height: 1 }); // the picture's own shape
  expect(doc.getPage(1).getSize()).toEqual(doc.getPage(2).getSize());
});

test("a book is split into parts, saved together as a zip", async ({ page }) => {
  await openTools(page, ["test/fixtures/links.pdf"]);
  await expect(tiles(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Make PDF" }).click();
  const sheet = page.getByRole("dialog", { name: "Make PDF" });
  await sheet.getByText("Split into parts").click();
  await sheet.getByLabel("Pages in each part").fill("2");
  await expect(sheet).toContainText("2 PDFs, saved together in one zip file.");
  const { name, bytes } = await make(page);
  expect(name).toBe("links (pages).zip");
  await expect(sheet).toContainText("2 PDFs in one zip file");
  const files = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(files).sort()).toEqual(["links (pages) (1).pdf", "links (pages) (2).pdf"]);
  expect((await PDFDocument.load(files["links (pages) (1).pdf"])).getPageCount()).toBe(2);
  expect((await PDFDocument.load(files["links (pages) (2).pdf"])).getPageCount()).toBe(1);
});

test("from a book: chosen pages are taken out into a new book of the library", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/links.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Links sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Book menu" }).click();
  await page.getByRole("button", { name: /^Edit pages/ }).click();

  await expect(page.getByRole("heading", { name: "PDF tools" })).toBeVisible();
  await expect(tiles(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Page 1: Links sample, Page 1" }).click();
  await page.getByRole("button", { name: "Page 3: Links sample, Page 3" }).click();
  await page.getByRole("button", { name: "Make PDF" }).click();
  const sheet = page.getByRole("dialog", { name: "Make PDF" });
  await expect(sheet.getByLabel("Only the 2 chosen")).toBeChecked();
  await sheet.getByLabel("Name").fill("Two of three");
  await make(page, false);
  await expect(sheet).toContainText("2 pages");
  await sheet.getByRole("button", { name: "Add to library" }).click();
  await expect(sheet).toContainText("It is in your library now.");
  await sheet.getByRole("button", { name: "Open it" }).click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveAccessibleName(/of 2/);
  await expect(page.locator('.page[data-page="2"]')).toContainText("Chapter three");
  // The book it came from is still whole.
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(2);
});

test("a protected PDF asks for its password, and a book of the library is added from a list", async ({ page }) => {
  await page.goto("./");
  const first = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await first).setFiles("src/sample/sample.pdf");
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "PDF tools" }).click();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDFs or pictures" }).click();
  await (await chooser).setFiles("test/fixtures/locked.pdf");
  const ask = page.getByRole("dialog", { name: "Password needed" });
  await ask.getByLabel("Password").fill("wrong");
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(ask).toContainText("That password is not right");
  await ask.getByLabel("Password").fill("open sesame");
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(tiles(page)).toHaveCount(2);

  await page.getByRole("button", { name: "Add from library" }).click();
  await page.getByRole("dialog", { name: "Add from library" }).getByRole("button", { name: /Reader343 sample/ }).click();
  await expect(tiles(page)).toHaveCount(4);
  await page.getByRole("button", { name: "Choose all" }).click();
  await expect(page.locator(".tools-count")).toHaveText("4 of 4 pages chosen");
  await page.getByRole("button", { name: "Choose none" }).click();

  await page.getByRole("button", { name: "Make PDF" }).click();
  const { bytes } = await make(page);
  // The new PDF opens without a password.
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
});

test("pages are dragged to another place", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "dragging with a mouse");
  await openTools(page, ["test/fixtures/links.pdf"]);
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator(".tool-thumb img")).toHaveCount(3);
  await tiles(page).nth(2).dragTo(tiles(page).nth(0));
  expect(await names(page)).toEqual(["links.pdf · 3", "links.pdf · 1", "links.pdf · 2"]);
  // With the shift key a run of pages is chosen at once.
  await tiles(page).nth(0).click();
  await tiles(page).nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator(".tools-count")).toHaveText("3 of 3 pages chosen");
});

test("PDF tools in Arabic", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "language", { value: "ar", configurable: true }));
  await page.goto("./#/tools");
  await expect(page.getByRole("heading", { name: "أدوات PDF" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "إضافة ملفات PDF أو صور" }).click();
  await (await chooser).setFiles("test/fixtures/links.pdf");
  await expect(tiles(page)).toHaveCount(3);
  await tiles(page).first().click();
  await expect(page.locator(".tools-count")).toHaveText("تم اختيار 1 من 3 صفحة");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
