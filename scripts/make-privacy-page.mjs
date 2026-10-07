// Writes the public privacy page (app/public/about/privacy.html) from docs/PRIVACY.md, so the two cannot
// drift apart. Run after changing the policy: node scripts/make-privacy-page.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const md = readFileSync(`${root}docs/PRIVACY.md`, "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/`(.+?)`/g, "<code>$1</code>")
  .replace(/(https:\/\/[^\s<]+[^\s<.,)])/g, '<a href="$1">$1</a>');

// A small Markdown reader for this one file: headings, paragraphs and one level of lists.
let html = "", para = [], list = [], item = [];
const flushPara = () => { if (para.length) html += `<p>${inline(para.join(" "))}</p>\n`; para = []; };
const flushItem = () => { if (item.length) list.push(inline(item.join(" "))); item = []; };
const flushList = () => { flushItem(); if (list.length) html += `<ul>\n${list.map((l) => `  <li>${l}</li>`).join("\n")}\n</ul>\n`; list = []; };
for (const line of md.split("\n").slice(1)) {
  if (/^## /.test(line)) { flushPara(); flushList(); html += `<h2>${inline(line.slice(3))}</h2>\n`; }
  else if (/^- /.test(line)) { flushPara(); flushItem(); item.push(line.slice(2)); }
  else if (/^  \S/.test(line) && item.length) item.push(line.trim());
  else if (!line.trim()) { flushPara(); flushList(); }
  else if (!line.startsWith("The same text is published")) para.push(line.trim());
}
flushPara();
flushList();

writeFileSync(`${root}app/public/about/privacy.html`, `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reader343: Privacy Policy</title>
<meta name="description" content="What Reader343 keeps on your device and the few cases in which something leaves it. No account, no analytics, no tracking.">
<meta name="theme-color" content="#f3f4f8" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0c11" media="(prefers-color-scheme: dark)">
<link rel="icon" href="../icons/favicon-32.png">
<link rel="stylesheet" href="about.css">
</head>
<body>
<div class="wrap">
  <header class="top">
    <a class="brand" href="./"><img src="../icons/icon-192.png" alt="" width="32" height="32">Reader343</a>
    <nav aria-label="Page">
      <a class="keep" href="./">What Reader343 does</a>
      <a class="keep" href="download.html">Download</a>
      <a href="https://github.com/MustafaManhal/smart-dark-app">Source</a>
    </nav>
  </header>

  <main class="prose">
    <h1>Privacy Policy</h1>
${html.split("\n").map((l) => (l ? "    " + l : l)).join("\n")}  </main>
</div>
<footer>
  <div class="wrap">
    <span>Reader343 is free software under the MIT license.</span>
    <span><a href="./">What Reader343 does</a></span>
  </div>
</footer>
</body>
</html>
`);
console.log("wrote app/public/about/privacy.html");
