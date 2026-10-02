// Captures Chrome Web Store images into store/ with the real extension:
// three 1280x800 screenshots and the 440x280 small promo tile (JPEG, no alpha).
// Run `node scripts/build.mjs --e2e` first.
import puppeteer from "puppeteer-core";
import http from "node:http";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = `${root}store/`;
mkdirSync(out, { recursive: true });

const files = {
  "/sample.pdf": readFileSync(`${root}src/sample/sample.pdf`),
};
const paper = `${root}test/output/arxiv-1706.03762.pdf`;
if (existsSync(paper)) files["/paper.pdf"] = readFileSync(paper);

const server = http.createServer((req, res) => {
  const body = files[new URL(req.url, "http://x").pathname];
  if (!body) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": "application/pdf" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  enableExtensions: [`${root}dist-e2e`],
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
});
const sw = await browser.waitForTarget((t) => t.type() === "service_worker");
const id = new URL(sw.url()).host;
const worker = await sw.worker();
await worker.evaluate(async () => {
  for (let i = 0; i < 50 && !(await chrome.declarativeNetRequest.getDynamicRules()).length; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function viewerShot(path, url, { scrollTo = 0, dark = true, theme = "dark", width = 1280 } = {}) {
  await worker.evaluate((s) => chrome.storage.sync.set(s), { enabled: dark, theme });
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector(".page canvas"), { timeout: 20000 });
  if (scrollTo) {
    await page.evaluate((y) => (document.getElementById("viewerContainer").scrollTop = y), scrollTo);
  }
  await sleep(1500);
  const buffer = await page.screenshot({ type: "png" });
  if (path) await page.screenshot({ path, type: "jpeg", quality: 92 });
  await page.close();
  return buffer;
}

// 1. Hero: the sample in smart dark mode.
await viewerShot(`${out}screenshot-1-smart-dark.jpg`, `${base}/sample.pdf`);

// 2. Before / after, side by side.
const before = await viewerShot(null, `${base}/sample.pdf`, { dark: false, width: 640, scrollTo: 330 });
const after = await viewerShot(null, `${base}/sample.pdf`, { dark: true, width: 640, scrollTo: 330 });
{
  const page = await browser.newPage();
  const img = (b) => `data:image/png;base64,${b.toString("base64")}`;
  await page.setContent(`<!doctype html><style>
    body{margin:0;display:flex;width:1280px;height:800px;font:600 15px system-ui,sans-serif}
    figure{margin:0;position:relative;width:640px;height:800px;overflow:hidden}
    img{display:block}
    figcaption{position:absolute;left:16px;bottom:16px;padding:8px 14px;border-radius:999px;
      background:rgb(13 14 18/.85);color:#fff;letter-spacing:.01em}
    figure+figure{border-left:2px solid #7aa7ff}
  </style>
  <figure><img src="${img(before)}"><figcaption>Original</figcaption></figure>
  <figure><img src="${img(after)}"><figcaption>Smart dark: hues kept, photo untouched</figcaption></figure>`);
  await page.screenshot({ path: `${out}screenshot-2-before-after.jpg`, type: "jpeg", quality: 92 });
  await page.close();
}

// 3. A real paper figure, in the warm theme.
if (files["/paper.pdf"]) {
  await viewerShot(`${out}screenshot-3-paper.jpg`, `${base}/paper.pdf#page=3`, { theme: "warm" });
}
await worker.evaluate(() => chrome.storage.sync.set({ enabled: true, theme: "dark" }));

// Small promo tile 440x280.
{
  const page = await browser.newPage();
  await page.setViewport({ width: 440, height: 280 });
  const icon = readFileSync(`${root}src/icons/icon128.png`).toString("base64");
  await page.setContent(`<!doctype html><style>
    body{margin:0;width:440px;height:280px;display:grid;place-items:center;
      background:radial-gradient(120% 120% at 0% 0%,#2a3350 0%,#15171c 60%);color:#e8eaee;
      font-family:system-ui,-apple-system,sans-serif}
    .wrap{display:flex;align-items:center;gap:18px;padding:0 28px}
    img{width:104px;height:104px}
    h1{margin:0 0 8px;font-size:30px;line-height:1.05;letter-spacing:-.01em}
    p{margin:0;font-size:15px;line-height:1.35;color:#b9c0cc}
    .dots{display:flex;gap:6px;margin-top:12px}
    .dots i{width:22px;height:6px;border-radius:3px;display:block}
  </style><div class="wrap"><img src="data:image/png;base64,${icon}">
  <div><h1>Smart Dark PDF</h1><p>Dark pages, real colors.<br>Photos stay untouched.</p>
  <div class="dots"><i style="background:#ff7a6e"></i><i style="background:#7aa7ff"></i><i style="background:#60cd80"></i></div></div></div>`);
  await page.screenshot({ path: `${out}promo-small-440x280.jpg`, type: "jpeg", quality: 95 });
  await page.close();
}

await browser.close();
server.close();
console.log("store images written to store/");
