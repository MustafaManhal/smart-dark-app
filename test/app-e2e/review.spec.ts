import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

async function select(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const range = document.createRange();
    range.setStart(node, node.textContent!.indexOf(t));
    range.setEnd(node, node.textContent!.indexOf(t) + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);
}

/** The sample book with a highlight and a note on a passage, back in the library. */
async function marked(page: Page) {
  await openSample(page);
  await select(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await select(page, "Black body text");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".sel-action").last().click();
  await page.locator(".pop-title").fill("Dark mode");
  await page.locator(".pop-note textarea").fill("Gray, not white, is easier on the eyes.");
  await page.locator(".pop-actions .btn-primary").click();
  await expect(page.locator(".pop-note")).toBeHidden();
  await page.getByRole("button", { name: "Back to library" }).click();
}

test("marks come back as cards: a highlight is rated at once, a note shows its back first", async ({ page }) => {
  await marked(page);
  const due = page.locator(".lib-review");
  await expect(due).toContainText("2 marks to review today.");
  await due.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
  await expect(page.locator(".review-left")).toHaveText("2 left");

  const card = page.getByRole("article", { name: "Card" });
  // Oldest first: the highlight. Its passage is the whole card.
  await expect(card.locator(".review-front")).toHaveText("colored words keep their hue");
  await expect(card).toContainText("Reader343 sample · Page 1");
  const grades = card.getByRole("group", { name: "How well did you remember it?" });
  await expect(grades.getByRole("button")).toHaveCount(4);
  await expect(grades.getByRole("button", { name: /Good/ })).toContainText("10 min");
  await expect(grades.getByRole("button", { name: /Easy/ })).toContainText("8 days");
  await page.screenshot({ path: `test/output/review-${test.info().project.name}.png` });
  await grades.getByRole("button", { name: /Good/ }).click();

  // The note: the passage asks, the note answers.
  await expect(card.locator(".review-front")).toHaveText("Black body text");
  await expect(card.getByText("Gray, not white")).toHaveCount(0);
  await expect(grades).toHaveCount(0);
  await card.getByRole("button", { name: "Show my note" }).click();
  await expect(card.locator(".review-back")).toContainText("Dark mode");
  await expect(card.locator(".review-back")).toContainText("Gray, not white, is easier on the eyes.");
  await grades.getByRole("button", { name: /Easy/ }).click();

  await expect(page.getByRole("heading", { name: "Done for today" })).toBeVisible();
  await expect(page.getByText("2 marks reviewed.")).toBeVisible();
  await expect(page.getByText("Review streak: 1 day")).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).last().click();
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator(".lib-review")).toHaveCount(0); // nothing is due any more today

  // The schedule is kept: coming back shows nothing due.
  await page.goto("./#/review");
  await expect(page.getByRole("heading", { name: "Nothing is due now" })).toBeVisible();
  await expect(page.getByText("Review streak: 1 day")).toBeVisible();
});

test("a card answered Again comes back before the sitting ends; keys work", async ({ page, isMobile }) => {
  await marked(page);
  await page.goto("./#/review");
  const front = page.locator(".review-front");
  await expect(front).toHaveText("colored words keep their hue");
  await page.getByRole("button", { name: /Again/ }).click();
  await expect(page.locator(".review-left")).toHaveText("2 left"); // still two: it went to the end
  await expect(front).toHaveText("Black body text");
  if (isMobile) {
    await page.getByRole("button", { name: "Show my note" }).click();
    await page.getByRole("button", { name: /Good/ }).click();
  } else {
    await page.keyboard.press("Space");
    await expect(page.locator(".review-back")).toBeVisible();
    await page.keyboard.press("3");
  }
  await expect(front).toHaveText("colored words keep their hue");
  await page.getByRole("button", { name: "Open in the book" }).click();
  await expect(page.locator(".reader-title strong")).toHaveText("Reader343 sample");
});

test("the review can be turned off, and an empty one explains itself", async ({ page }) => {
  await page.goto("./#/review");
  await expect(page.getByRole("heading", { name: "Nothing to review yet" })).toBeVisible();
  await marked(page);
  await expect(page.locator(".lib-review")).toBeVisible();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("group", { name: "New marks each day" }).getByRole("radio", { name: "Off" }).check();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.locator(".lib-review")).toHaveCount(0);
});

test("the review card fits a small phone in Arabic", async ({ page, isMobile }) => {
  test.skip(isMobile, "sets its own size");
  await page.setViewportSize({ width: 320, height: 640 });
  await marked(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).check();
  await page.goto("./#/review");
  await expect(page.getByRole("heading", { name: "المراجعة" })).toBeVisible();
  await expect(page.locator(".grade")).toHaveCount(4);
  const wide = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    out: [...document.querySelectorAll<HTMLElement>(".review *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
    }).map((el) => `${el.tagName}.${el.className}`),
    spills: [...document.querySelectorAll<HTMLElement>(".grade")].filter((el) => el.scrollWidth > el.clientWidth + 1).length,
  }));
  expect(wide).toEqual({ page: 0, out: [], spills: 0 });
  await page.screenshot({ path: "test/output/review-ar-320.png" });
});
