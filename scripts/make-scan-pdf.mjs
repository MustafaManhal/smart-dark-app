// Builds test/fixtures/scan.pdf: two pages that are pictures of text, with no text inside the PDF,
// as a scanner makes them. Used by the OCR tests. Needs the browser that Playwright installed.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { PDFDocument } from "@cantoo/pdf-lib";

const PAGES = [
  ["The Lighthouse Keeper", ["Every evening at dusk the keeper climbed", "the ninety-two steps to the lamp room.", "", "He trimmed the wick, polished the brass", "and wrote the weather in a green ledger."]],
  ["Chapter Two", ["On the third night a storm came from", "the north and the harbor bell rang twice.", "", "Nobody in the village slept until morning."]],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
const doc = await PDFDocument.create();
doc.setTitle("Scanned sample");
for (const [title, lines] of PAGES) {
  // A slightly gray, slightly turned page, as paper on a scanner glass is.
  await page.setContent(`<body style="margin:0;background:#f4f2ec"><div style="padding:150px 140px;transform:rotate(0.4deg);font:38px/1.7 Georgia,serif;color:#222">
    <h1 style="font-size:64px;margin:0 0 50px">${title}</h1>${lines.map((l) => `<div>${l || "&nbsp;"}</div>`).join("")}</div></body>`);
  const png = await page.screenshot({ type: "png" });
  const image = await doc.embedPng(png);
  doc.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
}
await browser.close();
const out = fileURLToPath(new URL("../test/fixtures/scan.pdf", import.meta.url));
writeFileSync(out, await doc.save());
console.log(`wrote ${out}`);
