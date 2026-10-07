import { expect, test } from "@playwright/test";

test("import a PDF, see it in the library, reject duplicates, remove it", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  const card = page.getByRole("list", { name: "Books" }).getByRole("listitem");
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Reader343 sample")).toBeVisible();
  await expect(card.locator("img")).toBeVisible();

  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await again).setFiles("src/sample/sample.pdf");
  await expect(page.getByRole("status")).toContainText("already in your library");

  await page.reload();
  await expect(card).toHaveCount(1);
  await page.screenshot({ path: `test/output/library-${test.info().project.name}.png` });

  await card.getByRole("button", { name: /Remove/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
});
