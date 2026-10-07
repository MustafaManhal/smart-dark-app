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

test("the download page offers every app, marks the one for this device, and compares them", async ({ page, browser, baseURL, isMobile }) => {
  await page.goto("./about/");
  await page.getByRole("navigation", { name: "Page" }).getByRole("link", { name: "Download" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Get Reader343" })).toBeVisible();
  const files = "https://github.com/MustafaManhal/smart-dark-app/releases/latest/download/";
  for (const [name, file] of [["Download (.exe)", "Reader343-win-x64.exe"], ["For Windows on ARM (.exe)", "Reader343-win-arm64.exe"], ["Download (Apple silicon)", "Reader343-mac-arm64.dmg"],
    ["For a Mac with an Intel processor (.dmg)", "Reader343-mac-x64.dmg"], ["Download (AppImage)", "Reader343-linux-x86_64.AppImage"]]) {
    await expect(page.locator("#all").getByRole("link", { name, exact: true })).toHaveAttribute("href", files + file);
  }
  await expect(page.getByRole("heading", { name: "iPhone and iPad" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Android" })).toBeVisible();
  // The table: six kinds of app, and the things that are not everywhere say where they are.
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveCount(7);
  await expect(table.getByRole("row", { name: /Sync through a folder you choose/ }).getByRole("cell")).toHaveText(["Yes", "No", "Yes", "No", "No", "No"]);
  await expect(table.getByRole("row", { name: /Opens PDF links of the web/ }).getByRole("cell").last()).toHaveText("Yes");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // The phone project is an iPhone: its card is marked and the steps are named.
  if (isMobile) {
    await expect(page.locator('article[data-os="ios"]')).toHaveClass(/is-yours/);
    await expect(page.locator("#best-note")).toContainText("added from Safari");
  }

  // A visitor on Windows gets the installer on the main button.
  const windows = await browser.newContext({ baseURL, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36" });
  const win = await windows.newPage();
  await win.goto("./about/download.html");
  await expect(win.locator("#best")).toHaveAttribute("href", files + "Reader343-win-x64.exe");
  await expect(win.locator('article[data-os="win"]')).toHaveClass(/is-yours/);
  await windows.close();

  await page.goto("./about/download-ar.html");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("احصل على Reader343");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(16);
});
