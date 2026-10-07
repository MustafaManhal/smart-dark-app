// End-to-end check with the real extension loaded in Chrome:
//   npm run e2e            (headless)
//   HEADFUL=1 npm run e2e  (watch it)
// Uses the installed Google Chrome (set CHROME_PATH to override).
import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFileSync, mkdirSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
const extensionPath = `${root}dist-e2e`;
const outDir = `${root}test/output`;
mkdirSync(outDir, { recursive: true });

const samplePdf = readFileSync(`${root}src/sample/sample.pdf`);
const arxivPath = `${outDir}/arxiv-1706.03762.pdf`;
if (!existsSync(arxivPath)) {
  const res = await fetch("https://arxiv.org/pdf/1706.03762");
  writeFileSync(arxivPath, Buffer.from(await res.arrayBuffer()));
}
const arxivPdf = readFileSync(arxivPath);

// Test server: PDFs served in the different ways real sites do.
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pdf = (body, headers = {}) => {
    res.writeHead(200, { "content-type": "application/pdf", ...headers });
    res.end(req.method === "POST" ? body : body);
  };
  switch (url.pathname) {
    case "/sample.pdf": return pdf(samplePdf);
    case "/paper.pdf": return pdf(arxivPdf);
    case "/view": return pdf(samplePdf); // no .pdf in the URL
    case "/octet.pdf": return pdf(samplePdf, { "content-type": "application/octet-stream" });
    case "/file": return pdf(samplePdf, { "content-disposition": "attachment; filename=x.pdf" });
    case "/form":
      res.writeHead(200, { "content-type": "text/html" });
      return res.end('<form method="post" action="/sample.pdf"><button id="go">go</button></form>');
    default:
      res.writeHead(404);
      res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: !process.env.HEADFUL,
  enableExtensions: [extensionPath],
  args: ["--window-size=1400,1000"],
  defaultViewport: { width: 1400, height: 1000, deviceScaleFactor: 1 },
});

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
  }
}

const sw = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().endsWith("background.js"));
const extensionId = new URL(sw.url()).host;
const viewerPrefix = `chrome-extension://${extensionId}/viewer/viewer.html`;

// The welcome page opens on install; wait for the DNR rules to be in place.
const worker = await sw.worker();
await worker.evaluate(async () => {
  for (let i = 0; i < 50; i++) {
    if ((await chrome.declarativeNetRequest.getDynamicRules()).length) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("DNR rules never registered");
});

async function openAndWait(url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  return page;
}

async function waitRendered(page, pages = 1) {
  await page.waitForFunction(
    (n) => document.querySelectorAll(".page canvas").length >= n,
    { timeout: 20000 },
    pages,
  );
}

await check("welcome page opens on install", async () => {
  const pages = await browser.pages();
  assert.ok(pages.some((p) => p.url().includes("/welcome/welcome.html")), "no welcome tab");
});

await check("PDF link (content-type) opens in the viewer and renders dark", async () => {
  const page = await openAndWait(`${base}/sample.pdf`);
  assert.ok(page.url().startsWith(viewerPrefix), `stayed on ${page.url()}`);
  await waitRendered(page);
  const corner = await page.evaluate(() => {
    const c = document.querySelector(".page canvas");
    return [...c.getContext("2d").getImageData(3, 3, 1, 1).data].slice(0, 3);
  });
  assert.ok(corner.every((v) => v < 60), `page corner not dark: ${corner}`);
  await page.screenshot({ path: `${outDir}/sample-dark.png` });
  await page.close();
});

await check("URL without .pdf is caught by content-type", async () => {
  const page = await openAndWait(`${base}/view?id=42`);
  assert.ok(page.url().startsWith(viewerPrefix), page.url());
  assert.ok(page.url().includes("/view?id=42"), "original URL lost");
  await waitRendered(page);
  await page.close();
});

await check(".pdf served as octet-stream is caught", async () => {
  const page = await openAndWait(`${base}/octet.pdf`);
  assert.ok(page.url().startsWith(viewerPrefix), page.url());
  await page.close();
});

await check("POST responses are left to the browser", async () => {
  const page = await openAndWait(`${base}/form`);
  await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => {}), page.click("#go")]);
  assert.ok(!page.url().startsWith(viewerPrefix), "POST PDF was redirected");
  await page.close();
});

await check("real paper: figures keep hue, text layer and #page work", async () => {
  const page = await openAndWait(`${base}/paper.pdf#page=3`);
  assert.ok(page.url().startsWith(viewerPrefix));
  await page.waitForFunction(() => document.getElementById("pageNumber").value === "3", { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.page[data-page="3"] canvas'), { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('.page[data-page="3"] .textLayer span'), { timeout: 20000 });
  await page.screenshot({ path: `${outDir}/paper-p3-dark.png` });
  await page.keyboard.press("d");
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `${outDir}/paper-p3-original.png` });
  await page.keyboard.press("d");
  await page.close();
});

await check("zoom and theme changes re-render without errors", async () => {
  const page = await openAndWait(`${base}/paper.pdf`);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await waitRendered(page);
  await page.click("#zoomIn");
  await page.click("#zoomIn");
  await page.select("#zoomSelect", "page-fit");
  await page.click("#settingsBtn");
  for (const theme of ["black", "warm", "slate", "dim", "dark"]) {
    await page.select("#themeSelect", theme);
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.keyboard.press("End");
  await page.waitForFunction(() => document.querySelector('.page[data-page="15"] canvas'), { timeout: 20000 });
  assert.deepEqual(errors, []);
  await page.close();
});

await check("brightness changes text only, sepia the whole page, Reset restores both", async () => {
  const page = await openAndWait(`${base}/sample.pdf`);
  await waitRendered(page);
  // Page corner (paper) and the lightest and warmest pixel of a line of body text.
  const read = () => page.evaluate(() => {
    const c = document.querySelector(".page canvas");
    const ctx = c.getContext("2d");
    const paper = [...ctx.getImageData(3, 3, 1, 1).data].slice(0, 3);
    const left = Math.round(c.width * 0.09), top = Math.round(c.height * 0.163);
    const data = ctx.getImageData(left, top, Math.round(c.width * 0.51), Math.round(c.height * 0.013)).data;
    let light = 0, warm = -255;
    for (let i = 0; i < data.length; i += 4) {
      light = Math.max(light, data[i] + data[i + 1] + data[i + 2]);
      warm = Math.max(warm, data[i] - data[i + 2]);
    }
    return { paper, light, warm };
  });
  const until = async (test) => {
    for (let i = 0; i < 100; i++) {
      const now = await read();
      if (test(now)) return now;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`pixels never changed: ${JSON.stringify(await read())}`);
  };
  const before = await read();
  assert.ok(before.light > 600, `text should be light on the dark page: ${before.light}`);
  await page.click("#settingsBtn");
  assert.equal(await page.$eval('[data-adjust="brightness"] .adjust-value', (o) => o.textContent), "Off");
  assert.equal(await page.$eval("#adjustReset", (b) => b.hidden), true);

  // Brightness -50: the text gets darker, the paper does not move.
  for (let i = 0; i < 10; i++) await page.click('[data-adjust="brightness"] button[data-step="-5"]');
  const dimmed = await until((now) => now.light < before.light * 0.6);
  assert.deepEqual(dimmed.paper, before.paper);
  assert.equal(await page.$eval('[data-adjust="brightness"] .adjust-value', (o) => o.textContent), "−50");
  assert.equal(await page.$eval('[data-adjust="brightness"] button[data-step="-5"]', (b) => b.disabled), true);

  // Sepia from the slider itself: text and paper both turn warm.
  await page.$eval("#adjSepia", (input) => {
    input.value = "100";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const warmed = await until((now) => now.warm > before.warm + 10);
  assert.ok(warmed.paper[0] > warmed.paper[2] + 2, `paper should be warm: ${warmed.paper}`);
  await page.screenshot({ path: `${outDir}/sample-adjusted.png` });

  await page.click("#adjustReset");
  const restored = await until((now) => now.light === before.light && now.warm === before.warm);
  assert.deepEqual(restored.paper, before.paper);
  assert.equal(await page.$eval("#adjustReset", (b) => b.hidden), true);
  await page.close();
});

await check("open in built-in viewer bypasses the redirect once", async () => {
  const page = await openAndWait(`${base}/sample.pdf`);
  await waitRendered(page);
  await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.click("#openOriginal")]);
  assert.equal(page.url(), `${base}/sample.pdf`);
  await page.close();
  await new Promise((r) => setTimeout(r, 9000));
  const again = await openAndWait(`${base}/sample.pdf`);
  assert.ok(again.url().startsWith(viewerPrefix), "bypass did not expire");
  await again.close();
});

await check("viewer opened without a file shows the open-file prompt", async () => {
  const page = await openAndWait(viewerPrefix);
  const visible = await page.$eval("#emptyState", (el) => !el.hidden);
  assert.ok(visible);
  await page.close();
});

await check("local file opens through the file picker", async () => {
  const page = await openAndWait(viewerPrefix);
  const input = await page.$("#fileInput");
  await input.uploadFile(`${root}src/sample/sample.pdf`);
  await waitRendered(page);
  const title = await page.$eval("#docTitle", (el) => el.textContent);
  assert.equal(title, "Reader343 sample");
  await page.close();
});

await check("welcome page sample button opens the bundled sample", async () => {
  const page = await openAndWait(`chrome-extension://${extensionId}/welcome/welcome.html`);
  await Promise.all([page.waitForNavigation(), page.click("#openSample")]);
  await waitRendered(page, 2);
  await page.close();
});

await check("download button saves the original PDF", async () => {
  const downloadDir = `${outDir}/downloads`;
  mkdirSync(downloadDir, { recursive: true });
  const page = await openAndWait(`${base}/sample.pdf`);
  await waitRendered(page);
  const cdp = await page.createCDPSession();
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloadDir });
  await page.click("#download");
  const file = `${downloadDir}/sample.pdf`;
  for (let i = 0; i < 50 && !existsSync(file); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(existsSync(file), "no download");
  assert.equal(readFileSync(file).length, samplePdf.length);
  rmSync(downloadDir, { recursive: true, force: true });
  await page.close();
});

await check("auto-open off stops redirects", async () => {
  await worker.evaluate(() => chrome.storage.sync.set({ autoOpen: false }));
  await worker.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      if (!(await chrome.declarativeNetRequest.getDynamicRules()).length) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("rules not removed");
  });
  const page = await openAndWait(`${base}/sample.pdf`);
  assert.ok(!page.url().startsWith(viewerPrefix), "still redirected");
  await page.close();
  await worker.evaluate(() => chrome.storage.sync.set({ autoOpen: true }));
});

await browser.close();
server.close();

for (const [status, name, detail] of results) console.log(`${status.padEnd(4)} ${name}${detail ? `\n     ${detail}` : ""}`);
const failed = results.filter(([s]) => s !== "ok").length;
console.log(`\n${results.length - failed}/${results.length} passed. Screenshots in test/output/`);
process.exit(failed ? 1 : 0);
