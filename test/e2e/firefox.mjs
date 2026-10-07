// End-to-end check of the Firefox build in a real Firefox:
//   npm run e2e:firefox
// Needs a Firefox: `npx @puppeteer/browsers install firefox@stable --path ~/.cache/puppeteer`,
// or set FIREFOX_PATH to one that is installed. It also runs on GitHub (.github/workflows/extension.yml).
//
// Firefox's automation (WebDriver BiDi) does not let a test open or look into an extension's own pages.
// So the viewer is checked from the outside: when a PDF address is sent to the viewer, the viewer
// fetches that PDF itself, and the test server sees that second request (it is not a page navigation).
import puppeteer from "puppeteer-core";
import http from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
// Host access is in this build's manifest: a test cannot press Firefox's permission question.
const extensionPath = `${root}dist-firefox-e2e`;

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

// Every request the server got: the path, the method, and whether a page asked for it ("document",
// "iframe") or a script did ("empty", which is what the viewer's fetch sends).
const seen = [];
const samplePdf = readFileSync(`${root}src/sample/sample.pdf`);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  seen.push({ path: url.pathname + url.search, method: req.method, dest: req.headers["sec-fetch-dest"] ?? "" });
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
      return res.end('<form method="post" action="/posted.pdf"><button id="go">go</button></form>');
    case "/posted.pdf": return pdf();
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
  userDataDir: mkdtempSync(`${realpathSync(tmpdir())}/reader343-firefox-`), // a fresh profile for each run
});
await browser.installExtension(extensionPath);
// The background script starts a moment after the install returns.
await new Promise((r) => setTimeout(r, 1500));

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (error) {
    results.push(["FAIL", name, error.message]);
  }
}
const requests = (path) => seen.filter((r) => r.path === path);
/** Opens an address in a new tab and waits for the viewer's own request for it, if one comes. */
async function open(path, { wait = 6000 } = {}) {
  const page = await browser.newPage();
  await page.goto(base + path, { waitUntil: "domcontentloaded" }).catch(() => {});
  const until = Date.now() + wait;
  while (Date.now() < until && !requests(path).some((r) => r.dest === "empty")) await new Promise((r) => setTimeout(r, 100));
  return page;
}
const byViewer = (path) => requests(path).filter((r) => r.dest === "empty").length;
const describe = (path) => JSON.stringify(requests(path));

await check("a PDF link is sent to the viewer, which loads the PDF itself", async () => {
  const page = await open("/sample.pdf");
  assert.ok(byViewer("/sample.pdf") >= 1, `the viewer never asked for the PDF: ${describe("/sample.pdf")}, tab at ${page.url()}`);
  assert.ok(!page.url().startsWith(base), `the tab stayed on the PDF's own address: ${page.url()}`);
  await page.close();
});

await check("an address without .pdf is caught by content-type, and keeps its query", async () => {
  const page = await open("/view?id=42");
  assert.ok(byViewer("/view?id=42") >= 1, describe("/view?id=42"));
  await page.close();
});

await check(".pdf served as octet-stream is caught, other octet-streams are not", async () => {
  const page = await open("/octet.pdf");
  assert.ok(byViewer("/octet.pdf") >= 1, describe("/octet.pdf"));
  await page.close();
  const other = await open("/data.bin", { wait: 2500 });
  assert.equal(byViewer("/data.bin"), 0, describe("/data.bin"));
  await other.close();
});

await check("web pages and POST responses are left to the browser", async () => {
  const plain = await open("/page", { wait: 1500 });
  assert.equal(plain.url(), `${base}/page`);
  assert.equal(byViewer("/page"), 0);
  await plain.close();
  const page = await open("/form", { wait: 500 });
  await page.click("#go").catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  assert.ok(requests("/posted.pdf").some((r) => r.method === "POST"), "the form was not sent");
  assert.equal(byViewer("/posted.pdf"), 0, describe("/posted.pdf"));
  await page.close();
});

await browser.close();
server.close();
for (const [status, name, message] of results) console.log(`${status.padEnd(4)} ${name}${message ? `\n     ${message}` : ""}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed in Firefox.`);
process.exit(failed ? 1 : 0);
