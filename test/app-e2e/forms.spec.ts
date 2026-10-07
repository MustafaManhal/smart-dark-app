import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

async function openForm(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/form.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Form sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".annotationLayer input").first()).toBeVisible();
}

test("a PDF form can be filled in on the page, and what was typed is kept", async ({ page }) => {
  await openForm(page);
  const fields = page.locator(".annotationLayer");
  const name = fields.locator('input[type="text"]').first();
  const city = fields.locator('input[type="text"]').nth(1);
  const news = fields.locator('input[type="checkbox"]');
  const kind = fields.locator("select");

  // The fields sit on the form's boxes: the name field is 27% in and about 14% down the page.
  const paper = (await page.locator('.page[data-page="1"]').boundingBox())!;
  const box = (await name.boundingBox())!;
  expect((box.x - paper.x) / paper.width).toBeCloseTo(160 / 595, 1);
  expect((box.y - paper.y) / paper.height).toBeCloseTo(1 - 716 / 842, 1);
  expect(box.width / paper.width).toBeCloseTo(300 / 595, 1);

  await name.fill("Ada Lovelace");
  await city.fill("London");
  await news.check();
  await kind.selectOption("Senior");
  await page.screenshot({ path: `test/output/form-${test.info().project.name}.png` });
  await page.waitForTimeout(800); // what is typed is saved a moment after the last key

  await page.reload();
  await expect(page.locator(".annotationLayer input").first()).toBeVisible();
  await expect(name).toHaveValue("Ada Lovelace");
  await expect(city).toHaveValue("London");
  await expect(news).toBeChecked();
  await expect(kind).toHaveValue("Senior");

  // The fields follow the zoom.
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => (await name.boundingBox())!.width).toBeGreaterThan(box.width * 1.1);
});

test("the filled form is saved into a copy of the PDF", async ({ page, isMobile }) => {
  await openForm(page);
  await page.getByRole("button", { name: "All tools" }).click();
  const menu = page.getByRole("dialog", { name: "All tools" });
  await expect(menu.getByRole("button", { name: /^Save a copy with the form and your marks/ })).toBeDisabled();
  await expect(menu).toContainText("Fill in the form on the page first.");
  await menu.getByRole("button", { name: "Close" }).click();

  await page.locator('.annotationLayer input[type="text"]').first().fill("Grace Hopper");
  await page.locator('.annotationLayer input[type="checkbox"]').check();
  await page.getByRole("button", { name: "All tools" }).click();
  await menu.getByRole("button", { name: /^Save a copy with the form and your marks/ }).click();
  const save = menu.getByRole("button", { name: /^Save the PDF with your marks/ });
  await expect(save).toContainText("the filled form is inside", { timeout: 20_000 });
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  const download = page.waitForEvent("download");
  await save.click();
  const path = test.info().outputPath("filled.pdf");
  await (await download).saveAs(path);
  // Read the copy back: the name is in the form.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  const annots = await (await doc.getPage(1)).getAnnotations();
  expect(annots.find((a) => a.fieldName === "name")?.fieldValue).toBe("Grace Hopper");
  expect(annots.find((a) => a.fieldName === "news")?.fieldValue).not.toBe("Off");
});

test("fields stay out of the way of the tools, and a book without a form has none", async ({ page }) => {
  await openForm(page);
  await page.getByRole("button", { name: "Draw" }).click();
  await expect(page.locator(".annotationLayer section").first()).toHaveCSS("pointer-events", "none");
  await page.getByRole("toolbar", { name: "Drawing" }).getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".annotationLayer section").first()).toHaveCSS("pointer-events", "auto");
  await page.getByRole("button", { name: "Back to library" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".annotationLayer")).toHaveCount(0);
});
