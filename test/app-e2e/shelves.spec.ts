import { expect, test, type Page } from "@playwright/test";

const list = (page: Page) => page.getByRole("list", { name: "Books" });

async function addBooks(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/links.pdf"]);
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
}

async function setTags(page: Page, title: string, tags: string) {
  // On a phone the bar of places lies over the bottom of the screen: the card is brought to the middle first.
  const edit = page.getByRole("button", { name: `Edit details of ${title}` });
  await edit.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await edit.click({ force: true });
  const sheet = page.getByRole("dialog", { name: "Book details" });
  await sheet.getByLabel("Tags, with commas between them").fill(tags);
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
}

test("continue reading offers the book that was open, at its page", async ({ page }) => {
  await addBooks(page);
  await expect(page.getByRole("region", { name: "Continue reading" })).toHaveCount(0);
  await list(page).getByText("Links sample").click();
  await expect(page.locator('.page[data-page="1"] .pdf-link')).toHaveCount(4);
  await page.locator('.page[data-page="1"] .pdf-link').nth(2).click(); // to page 2
  await expect(page.getByRole("button", { name: /^Page 2 of 3/ })).toBeVisible();
  await page.waitForTimeout(600); // the place is saved a moment after the scroll
  await page.getByRole("button", { name: "Back to library" }).click();

  const resume = page.getByRole("region", { name: "Continue reading" });
  await expect(resume.getByRole("button")).toHaveCount(1);
  await expect(resume.getByRole("button")).toContainText("Links sample");
  await expect(resume.getByRole("button")).toContainText("Page 2 of 3");
  // A search says what to show by itself: the row steps aside.
  await page.getByRole("searchbox").fill("smart");
  await expect(resume).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  await resume.getByRole("button").click();
  await expect(page.getByRole("button", { name: /^Page 2 of 3/ })).toBeVisible();
});

test("a star puts a book on the Favorites shelf and stays", async ({ page }) => {
  await addBooks(page);
  await page.getByRole("button", { name: "Add Links sample to favorites" }).click({ force: true });
  const star = page.getByRole("button", { name: "Remove Links sample from favorites" });
  await expect(star).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
  await expect(list(page)).toContainText("Links sample");
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove Links sample from favorites" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Links sample from favorites" }).click();
  await page.getByRole("tab", { name: "Favorites" }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(0);
  await expect(page.getByText("No books match.")).toBeVisible();
});

test("tags group books, filter the library and are offered again", async ({ page }) => {
  await addBooks(page);
  await expect(page.getByRole("group", { name: "Tags", exact: true })).toHaveCount(0);
  await setTags(page, "Links sample", "study,  Exam 2026, study");
  const tags = page.getByRole("group", { name: "Tags", exact: true });
  await expect(tags.getByRole("button")).toHaveText(["Exam 2026", "study"]);
  await expect(list(page).getByRole("listitem").filter({ hasText: "Links sample" })).toContainText("study · Exam 2026");

  // The other book is offered the tags that exist.
  await page.getByRole("button", { name: "Edit details of Reader343 sample" }).click({ force: true });
  const sheet = page.getByRole("dialog", { name: "Book details" });
  await sheet.getByRole("group", { name: "Tags you already use" }).getByRole("button", { name: "study" }).click();
  await expect(sheet.getByLabel("Tags, with commas between them")).toHaveValue("study");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();

  await tags.getByRole("button", { name: "Exam 2026" }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
  await expect(list(page)).toContainText("Links sample");
  await tags.getByRole("button", { name: "study" }).click();
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
  await tags.getByRole("button", { name: "study" }).click(); // again: the filter is off
  await page.getByRole("searchbox").fill("exam");
  await expect(list(page).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");

  // A tag that no book has any more goes away, and its filter with it.
  await tags.getByRole("button", { name: "Exam 2026" }).click();
  await setTags(page, "Links sample", "study");
  await expect(tags.getByRole("button")).toHaveText(["study"]);
  await expect(list(page).getByRole("listitem")).toHaveCount(2);
});

test("the library can be a list, and stays one", async ({ page }) => {
  await addBooks(page);
  await setTags(page, "Links sample", "study");
  await page.getByRole("button", { name: "Show as a list" }).click();
  await expect(list(page)).toHaveClass(/is-list/);
  const rows = await list(page).getByRole("listitem").evaluateAll((items) => items.map((li) => li.getBoundingClientRect()));
  expect(rows[1].top).toBeGreaterThanOrEqual(rows[0].bottom); // one under the other
  expect(rows[0].height).toBeLessThan(120);
  // In a list every action is in sight, without a pointer over the row.
  await expect(page.getByRole("button", { name: "Remove Links sample", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Links sample to favorites" })).toBeVisible();
  await page.screenshot({ path: `test/output/library-list-${test.info().project.name}.png` });
  await page.reload();
  await expect(list(page)).toHaveClass(/is-list/);
  await page.getByRole("button", { name: "Show as covers" }).click();
  await expect(list(page)).not.toHaveClass(/is-list/);
});

for (const width of [320, 390, 1280]) {
  test(`the library with every part shown fits ${width}px, in both views`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the phone project has one size");
    await page.setViewportSize({ width, height: 760 });
    await addBooks(page);
    await setTags(page, "Links sample", "study, Exam 2026, a rather long tag name here");
    await setTags(page, "Reader343 sample", "study");
    const star = page.getByRole("button", { name: "Add Links sample to favorites" });
    await star.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await star.click({ force: true });
    await list(page).getByText("Links sample").click();
    await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
    await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = 400; });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Back to library" }).click();
    await expect(page.getByRole("region", { name: "Continue reading" })).toBeVisible();
    for (const view of ["covers", "list"]) {
      if (view === "list") await page.getByRole("button", { name: "Show as a list" }).click();
      const overflow = await page.evaluate(() => {
        const wide = [...document.querySelectorAll<HTMLElement>(".library *")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
        }).map((el) => `${el.tagName}.${el.className}`);
        return { page: document.documentElement.scrollWidth - innerWidth, wide };
      });
      expect(overflow, view).toEqual({ page: 0, wide: [] });
      await page.waitForTimeout(300); // let the fade of the row buttons end before the picture
      await page.screenshot({ path: `test/output/library-${view}-${width}.png` });
    }
  });
}
