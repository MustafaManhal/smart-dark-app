// End-to-end check of the Firefox build in a real Firefox:
//   npm run e2e:firefox
// Needs a Firefox: `npx @puppeteer/browsers install firefox@stable --path ~/.cache/puppeteer`,
// or set FIREFOX_PATH to one that is installed. It also runs on GitHub (.github/workflows/extension.yml).
import puppeteer from "puppeteer-core";
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
// The build that is uploaded, not a test variant: the test presses "Allow access" itself.
const extensionPath = `${root}dist-firefox`;
// Firefox gives every installed extension a random address. A fixed one lets the test open its pages.
const UUID = "5f1a3c9e-7b2d-4e8a-9c41-2d6f0b8e7a13";
const own = (path) => `moz-extension://${UUID}/${path}`;
const outDir = `${root}test/output`;
mkdirSync(outDir, { recursive: true });

function findFirefox() {
  if (process.env.FIREFOX_PATH) return process.env.FIREFOX_PATH;
  const cache = `${homedir()}/.cache/puppeteer/firefox`;
  for (const build of existsSync(cache) ? readdirSync(cache).sort().reverse() : []) {
    for (const path of [`${cache}/${build}/Firefox.app/Contents/MacOS/firefox`, `${cache}/${build}/firefox/firefox`, `${cache}/${build}/core/firefox.exe`]) {
      if (existsSync(path)) return path;
    }
  }
  for (const path of ["/Applications/Firefox.app/Contents/MacOS/firefox", "/usr/bin/firefox"]) if (existsSync(path)) return path;
  throw new Error("No Firefox found. Install one (see the top of this file) or set FIREFOX_PATH.");
}

const samplePdf = readFileSync(`${root}src/sample/sample.pdf`);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pdf = (headers = {}) => {
    res.writeHead(200, { "content-type": "application/pdf", ...headers });
    res.end(samplePdf);
  };
  switch (url.pathname) {
    case "/sample.pdf": return pdf();
    case "/view": return pdf(); // no .pdf in the address
    case "/octet.pdf": return pdf({ "content-type": "application/octet-stream" });
    case "/data.bin": return pdf({ "content-type": "application/octet-stream" });
    case "/form":
      res.writeHead(200, { "content-type": "text/html" });
      return res.end('<form method="post" action="/sample.pdf"><button id="go">go</button></form>');
    case "/page":
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<h1>plain page</h1>");
    default:
      res.writeHead(404);
      res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  browser: "firefox",
  executablePath: findFirefox(),
  headless: !process.env.HEADFUL,
  defaultViewport: { width: 1400, height: 1000 },
  // A fresh profile for each run.
  userDataDir: mkdtempSync(`${realpathSync(tmpdir())}/reader343-firefox-`),
  // Firefox would show its own PDF viewer in the tab; the test must see where the tab ended up either way.
  extraPrefsFirefox: {
    "extensions.webextensions.uuids": JSON.stringify({ "reader343@smart-dark-app": UUID }),
    // The permission question is a window of the browser, which a test cannot press: it is answered with yes.
    "extensions.webextOptionalPermissionPrompts": false,
  },
});
await browser.installExtension(extensionPath);

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
  }
}
const inViewer = (url) => url.startsWith("moz-extension://") && url.includes("/viewer/viewer.html");
async function open(url, wait = (page) => inViewer(page.url())) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
  for (let i = 0; i < 50 && !wait(page); i++) await new Promise((r) => setTimeout(r, 100));
  return page;
}
const rendered = (page) => page.waitForFunction(() => document.querySelectorAll(".page canvas").length >= 1, { timeout: 20000 });

let viewerBase = own("viewer/viewer.html");

await check("the welcome page leaves out the local files step, and Allow access grants it", async () => {
  const welcome = await browser.newPage();
  await welcome.goto(own("welcome/welcome.html"), { waitUntil: "domcontentloaded" });
  await welcome.waitForSelector("#stepAccess", { timeout: 10000 });
  assert.equal(await welcome.$eval("#stepFiles", (el) => el.hidden), true);
  assert.equal(await welcome.evaluate(() => chrome.permissions.contains({ origins: ["<all_urls>"] })), false, "access before it was asked for");
  await welcome.click("#grantAccess");
  await welcome.waitForFunction(() => !document.getElementById("accessDone").hidden, { timeout: 5000 });
  assert.equal(await welcome.evaluate(() => chrome.permissions.contains({ origins: ["<all_urls>"] })), true);
  // The background script answers: it is running.
  assert.equal(await welcome.evaluate(() => chrome.runtime.sendMessage({ type: "bypassOnce", url: "http://127.0.0.1:1/never" })), true);
});

await check("installing opens the welcome page", async () => {
  const urls = (await browser.pages()).map((p) => p.url());
  assert.ok(urls.filter((u) => u.includes("/welcome/welcome.html")).length >= 2, `tabs: ${urls.join(", ")}`);
});

await check("PDF link (content-type) opens in the viewer and renders dark", async () => {
  const page = await open(`${base}/sample.pdf`);
  assert.ok(inViewer(page.url()), `stayed on ${page.url()}`);
  viewerBase = own("viewer/viewer.html");
  await rendered(page);
  const corner = await page.evaluate(() => {
    const c = document.querySelector(".page canvas");
    return [...c.getContext("2d").getImageData(3, 3, 1, 1).data].slice(0, 3);
  });
  assert.ok(corner.every((v) => v < 60), `page corner not dark: ${corner}`);
  await page.screenshot({ path: `${outDir}/firefox-sample-dark.png` });
  await page.close();
});

await check("an address without .pdf is caught by content-type, and keeps its query", async () => {
  const page = await open(`${base}/view?id=42`);
  assert.ok(inViewer(page.url()), page.url());
  assert.ok(page.url().includes("/view?id=42"), "original address lost");
  await rendered(page);
  await page.close();
});

await check(".pdf served as octet-stream is caught, other octet-streams are not", async () => {
  const page = await open(`${base}/octet.pdf`);
  assert.ok(inViewer(page.url()), page.url());
  await page.close();
  const other = await open(`${base}/data.bin`, () => false);
  assert.ok(!inViewer(other.url()), "a download was redirected");
  await other.close();
});

await check("web pages and POST responses are left to the browser", async () => {
  const plain = await open(`${base}/page`, () => false);
  assert.equal(plain.url(), `${base}/page`);
  await plain.close();
  const page = await open(`${base}/form`, () => true);
  await Promise.all([page.waitForNavigation({ timeout: 5000 }).catch(() => {}), page.click("#go")]);
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(!inViewer(page.url()), "POST PDF was redirected");
  await page.close();
});

await check("open in built-in viewer lets the address through once", async () => {
  const page = await open(`${base}/sample.pdf`);
  await rendered(page);
  await page.evaluate((url) => chrome.runtime.sendMessage({ type: "bypassOnce", url }), `${base}/sample.pdf`);
  const direct = await open(`${base}/sample.pdf`, () => false);
  assert.ok(!inViewer(direct.url()), "bypass did not work");
  await direct.close();
  await page.close();
});

await check("auto-open off stops redirects, on brings them back", async () => {
  const settings = await open(viewerBase, () => true);
  await settings.evaluate(() => chrome.storage.sync.set({ autoOpen: false }));
  await new Promise((r) => setTimeout(r, 300));
  const off = await open(`${base}/view?off=1`, () => false);
  assert.ok(!inViewer(off.url()), "redirected while off");
  await off.close();
  await settings.evaluate(() => chrome.storage.sync.set({ autoOpen: true }));
  await new Promise((r) => setTimeout(r, 300));
  const on = await open(`${base}/view?on=1`);
  assert.ok(inViewer(on.url()), "not redirected after turning on");
  await on.close();
  await settings.close();
});

await browser.close();
server.close();
for (const [status, name, message] of results) console.log(`${status.padEnd(4)} ${name}${message ? `\n     ${message}` : ""}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed in Firefox.`);
process.exit(failed ? 1 : 0);
