import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

test("back up the library, delete it, and restore it from the file", async ({ page, isMobile }) => {
  test.skip(isMobile, "the iPhone share sheet cannot be driven by tests; the save path is the same code");
  await openSample(page);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();

  await page.getByRole("button", { name: "Back up and restore" }).click();
  const sheet = page.getByRole("dialog", { name: "Back up and restore" });
  await sheet.getByRole("button", { name: "Create backup" }).click();
  const download = page.waitForEvent("download");
  await sheet.getByRole("button", { name: /Save backup/ }).click();
  const file = await download;
  const path = test.info().outputPath("backup.zip");
  await file.saveAs(path);
  expect(file.suggestedFilename()).toMatch(/^smart-dark-reader-backup-\d{4}-\d{2}-\d{2}\.zip$/);
  await sheet.getByRole("button", { name: "Close" }).click();

  const card = page.getByRole("list", { name: "Books" }).getByRole("listitem");
  await card.getByRole("button", { name: /Remove/ }).click();
  await page.getByRole("dialog", { name: "Remove book" }).getByRole("button", { name: "Remove" }).click();
  await expect(card).toHaveCount(0);

  await page.getByRole("button", { name: "Back up and restore" }).click();
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Choose backup file" }).click();
  await (await chooser).setFiles(path);
  await expect(sheet.getByRole("status")).toContainText("Restored 1 book and 1 highlight or note");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(card).toHaveCount(1);
  await card.getByText("Smart Dark PDF sample").click();
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toBeVisible();
});
