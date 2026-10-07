import { expect, test } from "@playwright/test";

test("a new reader is welcomed, tries the sample book and gets a three-step tour", async ({ page }) => {
  await page.goto("./");
  const welcome = page.getByRole("region", { name: "Welcome" });
  await expect(welcome.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
  await expect(welcome.getByRole("listitem")).toHaveCount(3);
  await expect(welcome.getByRole("button", { name: "Choose a PDF" })).toBeVisible();
  await page.screenshot({ path: `test/output/welcome-${test.info().project.name}.png` });
  await welcome.getByRole("button", { name: "Try the sample book" }).click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();

  const tour = page.getByRole("dialog", { name: "Quick tour" });
  await expect(tour).toContainText("Dark pages, real colors");
  await expect(tour).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Appearance" })).toHaveClass(/tour-target/);
  // The step sits next to the tool it is about.
  const tool = (await page.getByRole("button", { name: "Appearance" }).boundingBox())!;
  const box = (await tour.boundingBox())!;
  // (under the tool in the top bar of a wide screen, over it when the tool is in the dock of a phone)
  const gap = box.y > tool.y ? box.y - (tool.y + tool.height) : tool.y - (box.y + box.height);
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThan(30);
  await page.screenshot({ path: `test/output/tour-${test.info().project.name}.png` });

  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Mark what matters");
  await expect(page.getByRole("button", { name: "Highlight text" })).toHaveClass(/tour-target/);
  await expect(page.getByRole("button", { name: "Appearance" })).not.toHaveClass(/tour-target/);
  await expect(tour).toBeInViewport({ ratio: 1 });
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(tour).toContainText("Listen to the book");
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toHaveClass(/tour-target/);
  await expect(tour.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await tour.getByRole("button", { name: "Done" }).click();
  await expect(tour).toHaveCount(0);
  await expect(page.locator(".tour-target")).toHaveCount(0);

  // Back in the library the book is there; opening it again does not repeat the tour.
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Quick tour" })).toHaveCount(0);
});

test("the tour can be skipped, and steps aside for a sheet", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Try the sample book" }).click();
  const tour = page.getByRole("dialog", { name: "Quick tour" });
  await expect(tour).toBeVisible();
  // Trying the tool the step is about works: the tour waits behind the sheet.
  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
  await expect(tour).toHaveCount(0);
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Skip" }).click();
  await expect(tour).toHaveCount(0);
});

test("the tour fits a small phone in Arabic", async ({ page, isMobile }) => {
  test.skip(isMobile, "sets its own size");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("./");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("radio", { name: "العربية" }).check();
  await page.getByRole("button", { name: "العودة إلى المكتبة" }).click();
  await expect(page.getByRole("heading", { name: "مرحبًا بك في Reader343" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await page.screenshot({ path: "test/output/welcome-ar-320.png" });
  await page.getByRole("button", { name: "جرّب الكتاب التجريبي" }).click();
  const tour = page.getByRole("dialog", { name: "جولة سريعة" });
  for (let step = 0; step < 3; step++) {
    await expect(tour).toBeInViewport({ ratio: 1 });
    if (step === 0) await page.screenshot({ path: "test/output/tour-ar-320.png" });
    await tour.getByRole("button").last().click();
  }
  await expect(tour).toHaveCount(0);
});
