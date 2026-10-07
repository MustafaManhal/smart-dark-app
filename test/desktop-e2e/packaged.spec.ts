import { _electron as electron, expect, test } from "@playwright/test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Runs only after `npm run desktop:mac`: checks the real packaged app (files served from app.asar).
const exe = resolve(`release/mac-${process.arch === "arm64" ? "arm64" : ""}`.replace(/-$/, ""), "Reader343.app/Contents/MacOS/Reader343");
test.skip(process.platform !== "darwin" || !existsSync(exe), "packaged macOS build not present");

test("packaged app opens a PDF in smart dark", async () => {
  const profile = mkdtempSync(join(tmpdir(), "sdr-pkg-"));
  const app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`, resolve("src/sample/sample.pdf")] });
  const win = await app.firstWindow();
  await expect(win.locator('.page[data-page="1"] canvas')).toBeVisible({ timeout: 30_000 });
  const corner = await win.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));
  expect(corner.every((v) => v < 60)).toBe(true);
  expect(await app.evaluate(({ app: a }) => a.isPackaged)).toBe(true);
  await app.close();
});
