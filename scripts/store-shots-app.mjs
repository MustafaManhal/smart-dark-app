// Takes the Microsoft Store screenshots of the app (store/microsoft/, PNG, 1920x1080) from the built app.
// The Store asks for PNG files of 1366x768 or larger and shows up to ten of them.
// Run after `npm run app:build`: node scripts/store-shots-app.mjs
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = 5196;
const out = fileURLToPath(new URL("../store/microsoft/", import.meta.url));
mkdirSync(out, { recursive: true });
const server = spawn("node", ["scripts/serve-app.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch();
try {
  // 1280x720 drawn at 1.5x: the app at a comfortable size, the picture at 1920x1080.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: "dark", serviceWorkers: "block" });
  const page = await context.newPage();
  const shot = async (name) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}${name}.png` });
  };
  await page.goto(`http://localhost:${PORT}/`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a PDF" }).click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/links.pdf", "test/fixtures/headings.pdf"]);
  await page.getByRole("list", { name: "Books" }).getByRole("listitem").nth(2).waitFor();

  // 1. The reader: a dark page with its colors.
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await page.locator('.page[data-page="1"] canvas').waitFor();
  await shot("1-reader");

  // 2. Marks and notes, with the panel that lists them.
  const select = (text) => page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild;
    const range = document.createRange();
    range.setStart(node, node.textContent.indexOf(t));
    range.setEnd(node, node.textContent.indexOf(t) + t.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, text);
  const mark = async (text, color) => {
    await select(text);
    await page.waitForTimeout(400);
    await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").nth(color).click();
    await page.locator(".selection-bar").waitFor({ state: "detached" });
  };
  await mark("colored words keep their hue", 2);
  await mark("Reader343 sample - toggle", 1);
  await select("Black body text");
  await page.waitForTimeout(400);
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".sel-action").last().click();
  await page.locator(".pop-title").fill("Check this claim");
  await page.locator(".pop-note textarea").fill("Compare with the chart on page 2.");
  await page.locator(".pop-actions .btn-primary").click();
  await page.getByRole("button", { name: "Notes and highlights" }).click();
  await shot("2-notes");
  await page.getByRole("button", { name: "Close panel" }).click();

  // 3. Appearance: page styles and fine-tuning, judged by eye.
  await page.getByRole("button", { name: "Appearance" }).click();
  await shot("3-appearance");
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();

  // 4. The library.
  await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = 500; });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("region", { name: "Continue reading" }).waitFor();
  await page.mouse.move(640, 700);
  await shot("4-library");

  // 5. PDF tools: pages of two books, some chosen.
  await page.getByRole("button", { name: "PDF tools" }).click();
  for (const title of ["Reader343 sample", "Links sample"]) {
    await page.getByRole("button", { name: "Add from library" }).first().click();
    await page.getByRole("dialog", { name: "Add from library" }).getByRole("button", { name: new RegExp(title) }).click();
    await page.getByRole("dialog", { name: "Add from library" }).waitFor({ state: "detached" });
  }
  await page.locator(".tool-thumb img").nth(4).waitFor();
  await page.locator(".tool-page").nth(1).click();
  await page.locator(".tool-page").nth(3).click();
  await page.mouse.move(640, 690);
  await shot("5-pdf-tools");
} finally {
  await browser.close();
  server.kill();
}
console.log(`pictures written to ${out}`);
