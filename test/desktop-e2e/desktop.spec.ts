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
  await expect(win.locator(".reader-title strong")).toHaveText("Smart Dark PDF sample");
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
  await expect(win.getByRole("status")).toHaveText("Update checks are not set up for this build.");
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
