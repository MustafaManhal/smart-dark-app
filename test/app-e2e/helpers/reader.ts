import { expect, type Page } from "@playwright/test";

/** Imports the sample PDF from the empty library and opens it. */
export async function openSample(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("button", { name: /Go to page/ })).toBeEnabled();
}

export const pagePill = (page: Page) => page.getByRole("button", { name: /Go to page/ });

export async function expectPage(page: Page, n: number) {
  await expect(pagePill(page)).toHaveAccessibleName(new RegExp(`^Page ${n} of `));
}

export async function goToPage(page: Page, n: number) {
  await pagePill(page).click();
  const dialog = page.getByRole("dialog", { name: "Go to page" });
  await dialog.getByLabel("Page number").fill(String(n));
  await dialog.getByRole("button", { name: "Go" }).click();
  await expectPage(page, n);
}
