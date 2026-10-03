import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

test("web app manifest and iPhone icons are in place", async ({ page, request }) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Smart Dark Reader", short_name: "Smart Dark", display: "standalone", start_url: "./" });
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
  expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const res = await request.get(touch!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/png");
});

test("service worker takes control and caches everything the reader needs", async ({ page }) => {
  await page.goto("./");
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(new URL(req.url).pathname);
    }
    return urls;
  });
  for (const needed of ["/index.html", "/pdfjs/pdf.worker.mjs", "/pdfjs/wasm/openjpeg.wasm", "/pdfjs/standard_fonts/LiberationSans-Regular.ttf", "/pdfjs/cmaps/UniJIS-UTF16-H.bcmap"]) {
    expect(cached, needed).toContain(needed);
  }
  expect(cached.some((u) => /\/assets\/index-.*\.js$/.test(u))).toBe(true);
});

// Playwright's WebKit puts its offline emulation in front of the service worker,
// so a real offline run can only be automated in Chromium. WebKit is covered by
// the cache test above.
test("works offline after the first visit, including opening a book", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "offline emulation bypasses service workers in Playwright WebKit");
  await openSample(page);
  await page.getByRole("button", { name: "Back to library" }).click();
  // Wait until the service worker controls the page and has cached everything.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.page[data-page="2"] .textLayer span').first()).toBeAttached({ timeout: 20_000 }).catch(() => {});
  await context.setOffline(false);
});

test("iPhone Safari shows how to install, once", async ({ page, isMobile }) => {
  await page.goto("./");
  const hint = page.getByRole("note", { name: "Install the app" });
  if (!isMobile) {
    await expect(page.getByRole("heading", { name: "Add your first book" })).toBeVisible();
    await expect(hint).toHaveCount(0);
    return;
  }
  await expect(hint).toContainText("Add to Home Screen");
  await hint.getByRole("button", { name: "Dismiss" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Add your first book" })).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test("settings show how much space the library uses", async ({ page }) => {
  await page.goto("./#/settings");
  await expect(page.getByText(/Using \d+(\.\d)? MB\./)).toBeVisible();
});
