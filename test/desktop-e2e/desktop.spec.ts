import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let app: ElectronApplication;

test.beforeEach(async () => {
  // A fresh profile per test, so libraries do not leak between tests.
  const profile = mkdtempSync(join(tmpdir(), "sdr-"));
  app = await electron.launch({ args: [".", `--user-data-dir=${profile}`], cwd: resolve(".") });
});
test.afterEach(async () => app?.close());

test("desktop app starts on the library with a strict security policy", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  expect(win.url()).toBe("app://bundle/index.html");
  const csp = await win.evaluate(async () => (await fetch(location.href)).headers.get("content-security-policy"));
  expect(csp).toContain("default-src 'self'");
  expect(await win.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe("undefined");
  expect(await win.evaluate(() => typeof (window as unknown as { desktop?: unknown }).desktop)).toBe("object");
  // The desktop app serves its files locally; service workers are not even available on app://.
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => navigator.serviceWorker?.controller ?? null)).toBeNull();
  if (process.platform === "darwin") {
    // Room for the window buttons: nothing clickable in the top 28px.
    await expect(win.locator("html")).toHaveAttribute("data-platform", "darwin");
    const headingTop = await win.getByRole("heading", { name: "Your library" }).evaluate((h) => h.getBoundingClientRect().top);
    expect(headingTop).toBeGreaterThanOrEqual(28);
  }
});

test("a PDF opened from the operating system goes straight to the reader", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  const sample = resolve("src/sample/sample.pdf");
  // Same path as double-clicking a PDF in Finder (macOS sends "open-file").
  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), sample);
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(win.locator(".reader-title strong")).toHaveText("Reader343 sample");
  const corner = await win.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));
  expect(corner.every((v) => v < 60)).toBe(true); // smart dark works under the desktop CSP
  await win.screenshot({ path: "test/output/desktop-reader.png" });
});

test("menu navigation and the update check work", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("desktop:navigate", "#/settings"));
  await expect(win.getByRole("heading", { name: "Settings" })).toBeVisible();
  await win.getByRole("button", { name: "Check for updates" }).click();
  // The check asks GitHub for the newest release; without a connection it says so.
  await expect(win.getByRole("status")).toHaveText(/You have the latest version \(|Version .+ is available|Could not check for updates/, { timeout: 15_000 });
});

test("links open in the system browser, not inside the app", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  await app.evaluate(({ shell }) => {
    (globalThis as unknown as { opened: string[] }).opened = [];
    shell.openExternal = async (url: string) => void (globalThis as unknown as { opened: string[] }).opened.push(url);
  });
  await win.evaluate(() => window.open("https://example.com/page", "_blank"));
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { opened: string[] }).opened)).toEqual(["https://example.com/page"]);
  expect(win.url()).toBe("app://bundle/index.html");
});

// The desktop app reads the speech model from the web app's site. Here the local test
// server stands in for it (scripts/serve-app.mjs serves the same files and headers).
test("natural voices speak in the desktop app", async () => {
  test.setTimeout(180_000);
  await app.close();
  const profile = mkdtempSync(join(tmpdir(), "sdr-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${profile}`], cwd: resolve("."),
    env: { ...process.env, SMART_DARK_TEST_ORIGIN: "http://localhost:5198" } as Record<string, string>,
  });
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  expect(await win.evaluate(() => crossOriginIsolated)).toBe(true); // threads for the voice engine
  await win.evaluate(() => {
    const w = window as unknown as { __smartDarkModelHost: string; __clips: { seconds: number; peak: number }[] };
    w.__smartDarkModelHost = "http://localhost:5198/";
    // The device voices would speak out loud on the test machine: keep them quiet.
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { speaking: false, speak() {}, cancel() {}, getVoices: () => [] } });
    // Count the audio clips the natural voice plays, with their length and loudness.
    w.__clips = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const data = this.buffer!.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 11) peak = Math.max(peak, Math.abs(data[i]));
      w.__clips.push({ seconds: this.buffer!.duration, peak });
      this.disconnect(); // silent on the test machine
      return start.apply(this, args);
    };
  });
  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), resolve("src/sample/sample.pdf"));
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });

  await win.getByRole("button", { name: "Read aloud", exact: true }).click();
  await win.getByRole("button", { name: "Read aloud settings" }).click();
  const sheet = win.getByRole("dialog", { name: "Read aloud" });
  await sheet.getByRole("button", { name: "Download natural voices (102 MB)" }).click();
  const natural = sheet.getByRole("list", { name: "Natural voices" });
  await expect(natural.getByRole("listitem")).toHaveCount(28, { timeout: 90_000 });
  await expect(natural.getByRole("radio", { name: /Heart/ })).toBeChecked();

  const clips = () => win.evaluate(() => (window as unknown as { __clips: { seconds: number; peak: number }[] }).__clips);
  await natural.getByRole("button", { name: "Hear George" }).click();
  await expect.poll(async () => (await clips()).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  expect((await clips())[0].seconds).toBeGreaterThan(1.5);
  expect((await clips())[0].peak).toBeGreaterThan(0.1); // speech, not silence
  await win.screenshot({ path: "test/output/desktop-natural-voices.png" });
});

test("the welcome screen opens the sample book with its tour", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Welcome to Reader343" })).toBeVisible();
  await win.getByRole("button", { name: "Try the sample book" }).click();
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(win.getByRole("dialog", { name: "Quick tour" })).toContainText("Dark pages, real colors");
});

test("text recognition runs inside the desktop app", async () => {
  test.setTimeout(180_000);
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), resolve("test/fixtures/scan.pdf"));
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await win.getByRole("button", { name: "All tools" }).click();
  await win.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Recognize text/ }).click();
  const sheet = win.getByRole("dialog", { name: "Recognize text" });
  await sheet.getByRole("button", { name: "Start" }).click();
  await expect(sheet.getByRole("status")).toHaveText("Text was recognized on 2 pages.", { timeout: 150_000 });
  await expect(win.locator('.page[data-page="1"] .textLayer span', { hasText: "Lighthouse" }).first()).toBeVisible();
});

test("the desktop app syncs with a folder", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  // The app has the folder picker of its own. The test cannot press it, so it hands over a folder itself.
  expect(await win.evaluate(() => typeof (window as never as { showDirectoryPicker?: unknown }).showDirectoryPicker)).toBe("function");
  await win.evaluate(() => {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Shared", { create: true }),
    });
  });
  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), resolve("src/sample/sample.pdf"));
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send("desktop:navigate", "#/settings"));
  const card = win.locator("#set-sync");
  await card.getByRole("button", { name: "Choose a folder" }).click();
  await expect(card).toContainText("Folder: Shared");
  await expect(card).toContainText("1 book put in the folder. No other computer has used this folder yet.");
  const files = await win.evaluate(async () => {
    const root = await (await (await navigator.storage.getDirectory()).getDirectoryHandle("Shared")).getDirectoryHandle("Reader343");
    const names: string[] = [];
    for await (const name of (root as never as { keys(): AsyncIterable<string> }).keys()) names.push(name);
    return names.sort();
  });
  expect(files).toEqual(["books", "covers", "state"]);
});

test("an EPUB opened from the operating system is shown by the e-book reader", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), resolve("test/fixtures/sample.epub"));
  await expect(win.locator(".ebook-title strong")).toHaveText("The Lighthouse Ledger", { timeout: 20_000 });
  // The chapter is a frame made from the book's own files: the app's security policy must let it in, and it does.
  await expect.poll(async () => {
    for (const frame of win.frames().filter((f) => f.url().startsWith("blob:"))) {
      if (await frame.getByText("The first chapter opens with a walrus on the rocks.").isVisible().catch(() => false)) return true;
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
  await expect(win.locator(".ebook-title small")).toHaveText("One: The Keeper");
  await win.screenshot({ path: "test/output/desktop-ebook.png" });
});

test("the desktop app has the named places, the named tools, and makes a PDF with its PDF tools", async () => {
  const win = await app.firstWindow();
  await expect(win.getByRole("heading", { name: "Your library" })).toBeVisible();
  const places = win.getByRole("navigation", { name: "Places" });
  await expect(places.getByRole("button")).toHaveText(["Library", "Notebook", "PDF tools", "Reading stats", "Settings", "Back up and restore"]);
  // The link to the other apps is for the web app: this is one of them already.
  await expect(places.getByRole("link", { name: "Get the apps" })).toHaveCount(0);

  await app.evaluate(({ app: a }, path) => a.emit("open-file", { preventDefault() {} }, path), resolve("test/fixtures/links.pdf"));
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(win.getByRole("toolbar", { name: "Reading tools" }).locator(".btn-text")).toHaveCount(16);
  // What the browser's own model does is not offered here: the desktop app has no such model.
  await win.getByRole("button", { name: "All tools" }).click();
  const all = win.getByRole("dialog", { name: "All tools" });
  await expect(all.getByRole("button", { name: /^Recognize text/ })).toBeVisible();
  await expect(all.getByRole("button", { name: /^Summarize/ })).toHaveCount(0);
  await all.getByRole("button", { name: /^Edit pages/ }).click();

  await expect(win.getByRole("heading", { name: "PDF tools" })).toBeVisible();
  await expect(win.locator(".tool-page")).toHaveCount(3);
  await win.locator(".tool-page").nth(1).click();
  await win.getByRole("button", { name: "Remove pages" }).click();
  await expect(win.locator(".tool-page")).toHaveCount(2);
  await win.getByRole("button", { name: "Make PDF" }).click();
  const sheet = win.getByRole("dialog", { name: "Make PDF" });
  await sheet.getByRole("button", { name: "Make PDF" }).click();
  await expect(sheet.getByRole("button", { name: "Save" })).toBeVisible();
  await sheet.getByRole("button", { name: "Add to library" }).click();
  await expect(sheet).toContainText("It is in your library now.");
});
