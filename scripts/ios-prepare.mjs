// Prepares the web app for the iPhone package (Capacitor): copies app-dist to ios-web without the parts
// an iPhone does not use, and writes the security policy into the page itself. In the browser that policy
// comes from the server (vercel.json); inside the iPhone app there is no server, so it has to be in the page.
// Run after `npm run app:build`: node scripts/ios-prepare.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const from = `${root}app-dist/`, to = `${root}ios-web/`;
// Natural voices are for computers; the public page, the service worker and the web manifest belong to the web.
const leaveOut = [/^voices\//, /^tts\//, /^about\//, /^sw\.js$/, /^workbox-.*\.js$/, /^registerSW\.js$/, /^manifest\.webmanifest$/, /^\.well-known\//];

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true, filter: (src) => !leaveOut.some((rule) => rule.test(src.slice(from.length))) });

const headers = JSON.parse(readFileSync(`${root}vercel.json`, "utf8")).headers.find((h) => h.source === "/(.*)").headers;
const policy = headers.find((h) => h.key === "Content-Security-Policy").value
  .split(";").map((part) => part.trim())
  // frame-ancestors has no meaning in a page's own policy (browsers ignore it there and say so).
  .filter((part) => part && !part.startsWith("frame-ancestors"))
  .join("; ");
const page = `${to}index.html`;
const html = readFileSync(page, "utf8");
if (!html.includes("<head>")) throw new Error("index.html has no <head> to put the policy in");
writeFileSync(page, html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}">`));
console.log(`ios-web/ is ready (policy: ${policy.split(";").length} rules)`);
