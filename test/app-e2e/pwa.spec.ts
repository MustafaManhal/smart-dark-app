import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

test("web app manifest and iPhone icons are in place", async ({ page, request }) => {
  await page.goto("./");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "Reader343", short_name: "Reader343", display: "standalone", start_url: "./" });
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
  for (const needed of ["/index.html", "/pdfjs/pdf.worker.mjs", "/pdfjs/wasm/openjpeg.wasm", "/pdfjs/standard_fonts/LiberationSans-Regular.ttf"]) {
    expect(cached, needed).toContain(needed);
  }
  expect(cached.some((u) => /\/assets\/index-.*\.js$/.test(u))).toBe(true);
  // Small install: character maps are cached on first use instead.
  expect(cached.filter((u) => u.includes("/cmaps/"))).toEqual([]);
  expect(cached.length).toBeLessThan(60);
});

test("character maps are cached the first time a PDF needs them", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
    await fetch("./pdfjs/cmaps/UniJIS-UTF16-H.bcmap");
  });
  await expect.poll(() => page.evaluate(async () => {
    const c = await caches.open("pdfjs-cmaps");
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  })).toContain("/pdfjs/cmaps/UniJIS-UTF16-H.bcmap");
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
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.page[data-page="2"] .textLayer span').first()).toBeAttached({ timeout: 20_000 }).catch(() => {});
  await context.setOffline(false);
});

test("iPhone Safari shows how to install, once", async ({ page, isMobile }) => {
  await page.goto("./");
  const hint = page.getByRole("note", { name: "Install the app" });
  if (!isMobile) {
    await expect(page.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
    await expect(hint).toHaveCount(0);
    return;
  }
  await expect(hint).toContainText("Add to Home Screen");
  await hint.getByRole("button", { name: "Dismiss" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
  await expect(hint).toHaveCount(0);
});

test("settings show how much space the library uses", async ({ page }) => {
  await page.goto("./#/settings");
  await expect(page.getByText(/Using \d+(\.\d)? MB\./)).toBeVisible();
});

test("the installed app offers itself for PDF files, and opens the file it is handed", async ({ page, request }) => {
  // The system's side cannot be driven by a test: the queue it fills is replaced by one the test fills.
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", { configurable: true, value: { setConsumer(fn: unknown) { (window as never as { launch: unknown }).launch = fn; } } });
  });
  await page.goto("./");
  const manifest = await (await request.get((await page.locator('link[rel="manifest"]').getAttribute("href"))!)).json();
  expect(manifest.file_handlers).toEqual([{ action: "./", accept: { "application/pdf": [".pdf"], "application/epub+zip": [".epub"] } }]);
  expect(manifest.launch_handler).toEqual({ client_mode: "focus-existing" });

  // The app takes the queue once its library is open.
  await page.waitForFunction(() => typeof (window as never as { launch?: unknown }).launch === "function");
  const hand = (path: string, name: string) => page.evaluate(async ([url, fileName]) => {
    const bytes = await (await fetch(url)).arrayBuffer();
    const handle = { getFile: async () => new File([bytes], fileName, { type: "application/pdf" }) };
    await (window as never as { launch(p: unknown): Promise<void> }).launch({ files: [handle] });
  }, [path, name]);
  await hand("sample.pdf", "sample.pdf");
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.getByRole("button", { name: /Go to page/ })).toHaveAccessibleName(/of 2/);
  // The same file again opens the book that is already there, without a second copy.
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
  await hand("sample.pdf", "sample.pdf");
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(1);
});

test("a protected PDF handed to the app asks for its password, then opens", async ({ page }) => {
  const locked = readFileSync("test/fixtures/locked.pdf").toString("base64");
  await page.addInitScript(() => {
    Object.defineProperty(window, "launchQueue", { configurable: true, value: { setConsumer(fn: unknown) { (window as never as { launch: unknown }).launch = fn; } } });
  });
  await openSample(page); // the file arrives while a book is open
  await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const handle = { getFile: async () => new File([bytes], "locked.pdf", { type: "application/pdf" }) };
    await (window as never as { launch(p: unknown): Promise<void> }).launch({ files: [handle] });
  }, locked);
  const ask = page.getByRole("dialog", { name: "Password needed" });
  await ask.getByLabel("Password").fill("open sesame");
  await ask.getByRole("button", { name: "Open" }).click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("listitem")).toHaveCount(2);

  // Something that is not a PDF is refused with words, in the library.
  await page.evaluate(async () => {
    const handle = { getFile: async () => new File(["hello"], "notes.pdf", { type: "application/pdf" }) };
    await (window as never as { launch(p: unknown): Promise<void> }).launch({ files: [handle] });
  });
  await expect(page.getByText("notes.pdf is not a PDF.")).toBeVisible();
});
