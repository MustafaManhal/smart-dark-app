import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

test("Arabic switches the whole app to right-to-left", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).check();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();
  await page.getByRole("button", { name: "العودة إلى المكتبة" }).click();
  await expect(page.getByRole("heading", { name: "مكتبتك" })).toBeVisible();
  // The back arrow points the other way in right-to-left.
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /إضافة PDF|اختر ملف PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list").getByText("Smart Dark PDF sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("button", { name: "العودة إلى المكتبة" }).locator("svg")).toHaveClass(/icon-flip/);
  await expect(page.locator(".page-pill")).toHaveText("1/ 2");
  await page.screenshot({ path: `test/output/arabic-reader-${test.info().project.name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Choice survives a reload, and English comes back.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.getByRole("button", { name: "العودة إلى المكتبة" }).click();
  await page.getByRole("button", { name: "الإعدادات" }).click();
  await page.getByRole("radio", { name: "English" }).check();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("app theme can be forced to dark", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "Dark" }).first().check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(300); // colors ease in
  await page.screenshot({ path: `test/output/settings-dark-${test.info().project.name}.png`, fullPage: true });
});

test("edit a book's details by hand", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Edit details of Smart Dark PDF sample" }).click();
  const sheet = page.getByRole("dialog", { name: "Book details" });
  await sheet.getByLabel("Title").fill("Quarterly Report 2026");
  await sheet.getByLabel("Author").fill("Finance team");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("list", { name: "Books" })).toContainText("Quarterly Report 2026");
  await expect(page.getByRole("list", { name: "Books" })).toContainText("Finance team");
});

test.describe("online lookup", () => {
  // Playwright's WebKit cannot route requests once a service worker is active;
  // the worker has its own tests, so it is off here to guarantee the mocks.
  test.use({ serviceWorkers: "block" });

test("find book details online after opting in (network mocked)", async ({ page, context }) => {
  const ol = readFileSync("test/app/fixtures/openlibrary-hobbit.json", "utf8");
  const cover = readFileSync("src/icons/icon128.png");
  const requests: string[] = [];
  // context.route also sees requests that pass through the service worker.
  await context.route("https://openlibrary.org/**", (r) => { requests.push(r.request().url()); r.fulfill({ body: ol, contentType: "application/json", headers: { "access-control-allow-origin": "*" } }); });
  await context.route("https://www.googleapis.com/**", (r) => { requests.push(r.request().url()); r.fulfill({ status: 429, body: "{}", headers: { "access-control-allow-origin": "*" } }); });
  await context.route("https://covers.openlibrary.org/**", (r) => r.fulfill({ body: cover, contentType: "image/png", headers: { "access-control-allow-origin": "*" } }));

  await openSample(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Edit details of Smart Dark PDF sample" }).click();
  const sheet = page.getByRole("dialog", { name: "Book details" });
  await expect(sheet.getByText("Only the search text is sent")).toBeVisible();
  expect(requests).toEqual([]); // nothing sent before opting in
  await sheet.getByRole("button", { name: "Turn on online lookup" }).click();
  await sheet.getByLabel("Search online").fill("The Hobbit");
  await sheet.getByRole("button", { name: "Find details" }).click();
  const matches = sheet.getByRole("list", { name: "Matches" });
  await expect(matches.getByRole("button").first()).toContainText("J.R.R. Tolkien");
  expect(requests[0]).toContain("q=The+Hobbit");
  await matches.getByRole("button").first().click();
  await expect(sheet.getByLabel("Title")).toHaveValue("The Hobbit");
  await expect(sheet.locator(".details-cover")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  const card = page.getByRole("list", { name: "Books" }).getByRole("listitem");
  await expect(card).toContainText("The Hobbit");
  await expect(card.locator("img")).toHaveJSProperty("naturalWidth", 128);
});
});
