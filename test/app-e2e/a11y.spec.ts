import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A pass for people who use a screen reader or the keyboard: every screen is checked by axe-core against
// WCAG 2.1 A and AA (names of controls, roles, labels of fields, contrast, landmarks that make sense).
// It runs in one browser; the rules look at the page's structure, which is the same everywhere.
test.skip(({ browserName }) => browserName !== "chromium", "structure is checked in one browser");
test.use({ serviceWorkers: "block" });

async function problems(page: Page, where: string) {
  await page.waitForTimeout(300);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // The page of a PDF and the frame of an e-book hold the book's own content, which the app does not write.
    .exclude(".page .textLayer").exclude(".page canvas").exclude("foliate-view")
    .analyze();
  return result.violations.flatMap((v) => v.nodes.map((n) => `${where} | ${v.id} | ${n.target.join(" ")} | ${n.failureSummary?.split("\n")[1]?.trim() ?? v.help}`));
}

test("every screen passes the checks for screen readers and keyboards", async ({ page }) => {
  test.setTimeout(120_000);
  const found: string[] = [];
  await page.goto("./");
  found.push(...await problems(page, "welcome"));
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a PDF/ }).click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/sample.epub"]);
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(2);
  found.push(...await problems(page, "library"));

  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  found.push(...await problems(page, "reader"));
  await page.getByRole("button", { name: "Appearance" }).click();
  found.push(...await problems(page, "reader appearance"));
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Notes and highlights" }).click();
  found.push(...await problems(page, "reader notes"));
  await page.getByRole("button", { name: "Close panel" }).click();
  await page.getByRole("button", { name: "Book menu" }).click();
  found.push(...await problems(page, "book menu"));
  await page.getByRole("dialog", { name: "Book menu" }).getByRole("button", { name: "Close" }).click();
  await page.locator(".top-search").click();
  found.push(...await problems(page, "reader search"));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Back to library" }).click();

  await page.getByRole("list", { name: "Books" }).getByText("The Lighthouse Ledger").click();
  await expect(page.locator(".ebook-title small")).toHaveText("One: The Keeper");
  found.push(...await problems(page, "e-book"));
  await page.getByRole("button", { name: "Appearance" }).click();
  found.push(...await problems(page, "e-book appearance"));
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Search" }).click();
  found.push(...await problems(page, "e-book search"));
  await page.getByRole("dialog", { name: "Search in the book" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();

  for (const [button, name] of [["Notebook", "notebook"], ["PDF tools", "pdf tools"], ["Reading stats", "stats"], ["Settings", "settings"]]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    found.push(...await problems(page, name));
    await page.locator(".icon-btn").first().click();
    await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Back up and restore" }).click();
  found.push(...await problems(page, "backup"));

  expect(found, "accessibility problems").toEqual([]);
});
