// Takes the pictures of the public page (app/public/about/img/) from the built app.
// Run after `npm run app:build`: node scripts/about-shots.mjs
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const PORT = 5197;
const out = fileURLToPath(new URL("../app/public/about/img/", import.meta.url)); // decoded: the folder name may contain spaces
mkdirSync(out, { recursive: true });
const server = spawn("node", ["scripts/serve-app.mjs", String(PORT)], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const shot = (page, name) => page.screenshot({ path: `${out}${name}.jpg`, type: "jpeg", quality: 82 });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: "light", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a PDF" }).click();
  await (await chooser).setFiles(["src/sample/sample.pdf", "test/fixtures/links.pdf"]);
  await page.getByRole("list", { name: "Books" }).getByRole("listitem").nth(1).waitFor();

  // The reader, as it opens.
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await page.locator('.page[data-page="1"] canvas').waitFor();
  await page.waitForTimeout(600);
  await shot(page, "reader");

  // Appearance, beside the page.
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.waitForTimeout(400);
  await shot(page, "appearance");
  await page.getByRole("dialog", { name: "Appearance" }).getByRole("button", { name: "Close" }).click();

  // A highlight, an underline and a note, then the panel that lists them.
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
    await page.waitForTimeout(400); // the bar comes a moment after the selection settles
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
  await page.waitForTimeout(700);
  await shot(page, "notes");
  await page.getByRole("button", { name: "Close panel" }).click();

  // The library, with a book in progress.
  await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = 500; });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("region", { name: "Continue reading" }).waitFor();
  await page.getByRole("button", { name: "Add Links sample to favorites" }).click({ force: true });
  await page.mouse.move(640, 700);
  await page.waitForTimeout(400);
  await shot(page, "library");

  // A phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await page.locator('.page[data-page="1"] canvas').waitFor();
  await page.locator(".reader-scroll").evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(700);
  await shot(page, "phone");
} finally {
  await browser.close();
  server.kill();
}
console.log(`pictures written to ${out}`);
