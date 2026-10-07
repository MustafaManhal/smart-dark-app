import { readFileSync, statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

async function addLocked(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/locked.pdf");
  return page.getByRole("dialog", { name: "Password needed" });
}

test("a protected PDF opens with its password and does not ask again", async ({ page }) => {
  const ask = await addLocked(page);
  await expect(ask).toContainText("locked.pdf");
  await expect(ask.getByRole("button", { name: "Open" })).toBeDisabled();
  await ask.getByLabel("Password").fill("wrong");
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(ask.getByRole("alert")).toHaveText("That password is not right. Try again.");
  await expect(ask.getByLabel("Password")).toHaveValue("");
  await ask.getByLabel("Password").fill("open sesame");
  await ask.getByLabel("Password").press("Enter");
  await expect(ask).toBeHidden();

  const book = page.getByRole("list", { name: "Books" }).getByText("Locked sample");
  await book.click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Password needed" })).toHaveCount(0);
});

test("giving up on the password leaves the book out, with a message", async ({ page }) => {
  const ask = await addLocked(page);
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("locked.pdf was not added: it needs its password.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(0);
});

test("a protected book without a stored password asks for it in the reader", async ({ page }) => {
  const ask = await addLocked(page);
  await ask.getByLabel("Password").fill("open sesame");
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByText("Locked sample")).toBeVisible();
  // What a restored backup looks like: the book is there, its password is not.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("smart-dark-reader");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction("books", "readwrite");
      const store = tx.objectStore("books");
      store.getAll().onsuccess = (e) => {
        for (const book of (e.target as IDBRequest).result) {
          delete book.password;
          store.put(book);
        }
      };
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.getByRole("list", { name: "Books" }).getByText("Locked sample").click();
  const again = page.getByRole("dialog", { name: "Password needed" });
  await expect(again).toBeVisible();
  await expect(again.getByRole("alert")).toHaveCount(0);
  await again.getByLabel("Password").fill("nope");
  await again.getByRole("button", { name: "Open" }).click();
  await expect(again.getByRole("alert")).toBeVisible();
  await again.getByLabel("Password").fill("open sesame");
  await again.getByRole("button", { name: "Open" }).click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.reload();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Password needed" })).toHaveCount(0);
});

test("print prepares every page in its own colors", async ({ page, browserName }) => {
  await openSample(page);
  await page.evaluate(() => {
    (window as unknown as { printed: number }).printed = 0;
    window.print = () => { (window as unknown as { printed: number }).printed++; };
  });
  await page.getByRole("button", { name: "Book menu" }).click();
  await page.getByRole("dialog", { name: "Book menu" }).getByRole("button", { name: /^Print/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  await expect(page.locator(".print-root img")).toHaveCount(2);
  await expect(page.getByRole("dialog", { name: "Book menu" })).toBeHidden();
  // On screen the prepared pages stay out of sight.
  await expect(page.locator(".print-root")).toBeHidden();
  // The paper is white with dark text even though the reader shows a dark page.
  const paper = await page.locator(".print-root img").first().evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    return [...ctx.getImageData(4, 4, 1, 1).data.slice(0, 3)];
  });
  expect(Math.min(...paper)).toBeGreaterThan(240);

  if (browserName === "chromium") {
    // What the printer gets: one sheet per page of the book, nothing else.
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const sheets = pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? [];
    expect(sheets).toHaveLength(2);
  }
  await page.evaluate(() => dispatchEvent(new Event("afterprint")));
  await expect(page.locator(".print-root")).toHaveCount(0);
});

test("save a copy gives back the PDF file", async ({ page, isMobile }) => {
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  await openSample(page);
  await page.getByRole("button", { name: "Book menu" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("dialog", { name: "Book menu" }).getByRole("button", { name: /^Save a copy(?! with)/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("sample.pdf");
  const path = test.info().outputPath("copy.pdf");
  await file.saveAs(path);
  expect(statSync(path).size).toBe(statSync("src/sample/sample.pdf").size);
  expect(readFileSync(path).subarray(0, 5).toString()).toBe("%PDF-");
});

test("a copy with the marks inside is a PDF that carries them", async ({ page, isMobile }) => {
  await openSample(page);
  // Without marks there is nothing to put in.
  await page.getByRole("button", { name: "Book menu" }).click();
  const menu = page.getByRole("dialog", { name: "Book menu" });
  await expect(menu.getByRole("button", { name: /^Save a copy with your marks/ })).toBeDisabled();
  await expect(menu).toContainText("This book has no marks or notes yet.");
  await menu.getByRole("button", { name: "Close" }).click();

  await page.locator(".textLayer span", { hasText: "colored words keep their hue" }).first().evaluate((span) => {
    const range = document.createRange();
    range.selectNodeContents(span);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);

  await page.getByRole("button", { name: "Book menu" }).click();
  await menu.getByRole("button", { name: /^Save a copy with your marks/ }).click();
  const save = menu.getByRole("button", { name: /^Save the PDF with your marks/ });
  await expect(save).toBeVisible({ timeout: 20_000 });
  await expect(save).toContainText("1 marks and notes inside");
  await expect(menu).toBeInViewport({ ratio: 1 });
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  const download = page.waitForEvent("download");
  await save.click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("sample (with marks).pdf");
  const path = test.info().outputPath("marked.pdf");
  await file.saveAs(path);
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  // The mark's own drawing is in the file (the mark itself sits in a packed part; the unit test reads it back).
  expect(bytes.toString("latin1")).toContain("/BM /Multiply");
  expect(bytes.length).toBeGreaterThan(20_000);
  await expect(menu).toBeHidden();
});
