import { expect, test, type Page } from "@playwright/test";
import { expectPage } from "./helpers/reader";

async function openLinks(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("test/fixtures/links.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Links sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.page[data-page="1"] .pdf-link')).toHaveCount(4);
}

const link = (page: Page, n: number) => page.locator('.page[data-page="1"] .pdf-link').nth(n);
const back = (page: Page) => page.getByRole("button", { name: /^Back to page/ });

test("a link into the book jumps to its place, and Back returns", async ({ page }) => {
  await openLinks(page);
  await expect(back(page)).toHaveCount(0);
  await expect(link(page, 0)).toHaveAccessibleName("Link to page 3");
  await link(page, 0).click();
  await expectPage(page, 3);
  // The link points at the "Results table" heading, not at the top of page 3.
  const heading = page.locator('.page[data-page="3"] .textLayer span', { hasText: "Results table" });
  await expect(heading).toBeInViewport();
  const { top, end } = await page.locator(".reader-scroll").evaluate((el) => ({ top: el.scrollTop, end: el.scrollHeight - el.clientHeight }));
  const pageTop = await page.locator('.page[data-page="3"]').evaluate((el: HTMLElement) => el.offsetTop);
  // (a short last page on a tall phone cannot scroll that far: there the book is simply at its end)
  expect(top > pageTop + 50 || top >= end - 2).toBe(true);

  await expect(back(page)).toHaveAccessibleName("Back to page 1");
  await back(page).click();
  await expectPage(page, 1);
  await expect(back(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\//); // a link never leaves the reader
});

test("named places and action links work, and jumps stack up", async ({ page, isMobile }) => {
  await openLinks(page);
  await link(page, 1).click(); // named place: the glossary on page 2
  await expectPage(page, 2);
  await expect(page.locator('.page[data-page="2"] .textLayer span', { hasText: "Glossary" })).toBeInViewport();
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("dialog", { name: "Contents" }).getByRole("button", { name: /Chapter three/ }).click();
  await expectPage(page, 3);
  await expect(back(page)).toHaveAccessibleName("Back to page 2");
  if (isMobile) await back(page).click();
  else await page.keyboard.press("Alt+ArrowLeft");
  await expectPage(page, 2);
  await back(page).click();
  await expectPage(page, 1);
  await link(page, 2).click(); // made by a GoTo action
  await expectPage(page, 2);
});

test("a web address opens outside the app", async ({ page }) => {
  await openLinks(page);
  const web = link(page, 3);
  await expect(web).toHaveAttribute("href", "https://example.com/site");
  await expect(web).toHaveAttribute("target", "_blank");
  await expect(web).toHaveAttribute("rel", /noopener/);
});

test("links stay out of the way of the highlighter and the eraser", async ({ page }) => {
  await openLinks(page);
  await page.getByRole("button", { name: "Highlight text" }).click();
  await expect(link(page, 0)).toHaveCSS("pointer-events", "none");
  await page.getByRole("button", { name: "Erase highlights and notes" }).click();
  await expect(link(page, 0)).toHaveCSS("pointer-events", "none");
  await page.getByRole("button", { name: "Erase highlights and notes" }).click();
  await expect(link(page, 0)).toHaveCSS("pointer-events", "auto");
});

test("resting the mouse on a link shows where it leads", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone has no pointer to rest; see the long press test");
  await openLinks(page);
  await link(page, 0).hover();
  const preview = page.getByRole("tooltip", { name: "Page 3" });
  await expect(preview).toBeVisible();
  await expect(preview.locator("canvas")).toBeVisible();
  await expect(preview).toBeInViewport({ ratio: 1 });
  // The picture starts near the heading the link points at, not at the top of the page.
  const shift = await preview.locator("canvas").evaluate((c: HTMLElement) => parseFloat(getComputedStyle(c).translate.split(" ")[1] ?? "0"));
  expect(shift).toBeLessThan(-60);
  await page.screenshot({ path: "test/output/link-preview-desktop.png" });
  await page.mouse.move(5, 400);
  await expect(preview).toBeHidden();
  await expectPage(page, 1);
});

test("a long press on a link shows where it leads, with a button to go", async ({ page, isMobile }) => {
  test.skip(!isMobile, "long press is for touch screens");
  await openLinks(page);
  const box = (await link(page, 0).boundingBox())!;
  const at = { clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
  await link(page, 0).dispatchEvent("pointerdown", { ...at, pointerType: "touch", bubbles: true });
  const preview = page.getByRole("dialog", { name: "Page 3" });
  await expect(preview).toBeVisible();
  await link(page, 0).dispatchEvent("pointerup", { ...at, pointerType: "touch", bubbles: true });
  await link(page, 0).dispatchEvent("click", { ...at, bubbles: true });
  await expect(preview).toBeVisible(); // letting go does not follow the link
  await expectPage(page, 1);
  await expect(preview).toBeInViewport({ ratio: 1 });
  await expect(preview.locator("canvas")).toBeVisible();
  await page.screenshot({ path: "test/output/link-preview-phone.png" });
  await preview.getByRole("button", { name: "Go there" }).click();
  await expectPage(page, 3);
  await expect(back(page)).toHaveAccessibleName("Back to page 1");
});
