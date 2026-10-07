import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("the public page explains the app and opens it in one click", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("./about/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Read PDFs in the dark, with their colors.");
  // Every picture is there.
  const pictures = page.locator("main img");
  await expect(pictures).toHaveCount(5);
  for (const img of await pictures.all()) {
    await img.scrollIntoViewIfNeeded();
    await expect(img).toHaveJSProperty("complete", true);
    expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(300);
    expect((await img.getAttribute("alt"))!.length).toBeGreaterThan(20);
  }
  // The typeface is the app's, from this site.
  expect(await page.evaluate(() => document.fonts.check('16px "Inter Variable"'))).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test/output/about-${test.info().project.name}.png`, fullPage: true });

  await page.getByRole("link", { name: "Open the app" }).first().click();
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
});

test("the public page reads right to left in Arabic and links back", async ({ page }) => {
  await page.goto("./about/");
  await page.getByRole("link", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("اقرأ ملفات PDF في الظلام، مع ألوانها.");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

for (const width of [320, 768, 1280]) {
  test(`the public page fits ${width}px in both languages`, async ({ page, isMobile }) => {
    test.skip(isMobile, "sets its own size");
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["./about/", "./about/ar.html"]) {
      await page.goto(path);
      const wide = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - innerWidth,
        out: [...document.querySelectorAll<HTMLElement>("body *")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1);
        }).map((el) => el.tagName + "." + el.className),
      }));
      expect(wide, path).toEqual({ page: 0, out: [] });
    }
    await page.screenshot({ path: `test/output/about-ar-${width}.png` });
  });
}

test("Settings links to the public page", async ({ page }) => {
  await page.goto("./#/settings");
  await expect(page.getByRole("link", { name: "What Reader343 does" })).toHaveAttribute("href", /about\/$/);
});

test("the privacy policy is a page of its own, linked from the public page", async ({ page }) => {
  await page.goto("./about/");
  await page.locator("footer").getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "When something leaves your device" })).toBeVisible();
  await expect(page.locator("main")).toContainText("There is no account, no analytics, no advertising and no tracking.");
  // Every case the app's own security policy allows a connection for is named on the page.
  for (const host of ["Open Library", "Google Books", "en.wiktionary.org", "Hugging Face", "GitHub"]) await expect(page.locator("main")).toContainText(host);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.goto("./about/ar.html");
  await expect(page.locator("footer").getByRole("link", { name: "الخصوصية" })).toHaveAttribute("href", "privacy.html");
});
