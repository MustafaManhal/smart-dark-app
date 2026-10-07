// Builds test/fixtures/links.pdf: three pages with the kinds of links a book
// has (a jump to a place on another page, a jump to a named place, a jump made
// by an action, and a web address).
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../test/fixtures/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const W = 595, H = 842;
const text = (x, y, size, str, font = "F1", color = "0 0 0") => `BT /${font} ${size} Tf ${color} rg ${x} ${y} Td (${str}) Tj ET\n`;
const BLUE = "0.1 0.3 0.8";
// A link sits on its words: Helvetica at 14pt is about 7pt a letter.
const box = (x, y, str) => `[${x} ${y - 4} ${x + Math.ceil(str.length * 7.2)} ${y + 13}]`;
const filler = (from, lines) => Array.from({ length: lines }, (_, i) =>
  text(60, from - i * 22, 12, `Line ${i + 1} of plain body text that fills the page.`)).join("");

const objects = [];
const add = (body) => objects.push(body) && objects.length;
const stream = (data) => `<< /Length ${data.length} >>\nstream\n${data}\nendstream`;

const catalog = add(null);
const pagesId = add(null);
const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
const res = `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> >>`;

const LINKS = { results: "See the results table", glossary: "Open the glossary", action: "Jump by action", site: "Project site", home: "Back to the start" };
const c1 = add(stream(
  text(60, 760, 24, "Links sample", "F2") +
  text(60, 700, 14, LINKS.results, "F1", BLUE) +
  text(60, 660, 14, LINKS.glossary, "F1", BLUE) +
  text(60, 620, 14, LINKS.action, "F1", BLUE) +
  text(60, 580, 14, LINKS.site, "F1", BLUE) +
  filler(520, 18)));
const c2 = add(stream(text(60, 760, 24, "Chapter two", "F2") + filler(700, 12) + text(60, 400, 18, "Glossary", "F2") + filler(370, 12)));
const c3 = add(stream(text(60, 760, 24, "Chapter three", "F2") + filler(700, 8) + text(60, 500, 18, "Results table", "F2") +
  text(60, 470, 14, LINKS.home, "F1", BLUE) + filler(430, 14)));

const page1 = add(null);
const page2 = add(null);
const page3 = add(null);
const link = (rect, target) => add(`<< /Type /Annot /Subtype /Link /Rect ${rect} /Border [0 0 0] ${target} >>`);
const l1 = link(box(60, 700, LINKS.results), `/Dest [${page3} 0 R /XYZ 0 520 null]`);
const l2 = link(box(60, 660, LINKS.glossary), "/Dest (glossary)");
const l3 = link(box(60, 620, LINKS.action), `/A << /S /GoTo /D [${page2} 0 R /Fit] >>`);
const l4 = link(box(60, 580, LINKS.site), "/A << /S /URI /URI (https://example.com/site) >>");
const l5 = link(box(60, 470, LINKS.home), `/Dest [${page1} 0 R /Fit]`);
const page = (content, annots) =>
  `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${content} 0 R${annots.length ? ` /Annots [${annots.map((a) => `${a} 0 R`).join(" ")}]` : ""} >>`;
objects[page1 - 1] = page(c1, [l1, l2, l3, l4]);
objects[page2 - 1] = page(c2, []);
objects[page3 - 1] = page(c3, [l5]);
objects[pagesId - 1] = `<< /Type /Pages /Kids [${page1} 0 R ${page2} 0 R ${page3} 0 R] /Count 3 >>`;
const outlines = add(null);
const o1 = add(`<< /Title (Chapter three) /Parent ${outlines} 0 R /Dest [${page3} 0 R /Fit] >>`);
objects[outlines - 1] = `<< /Type /Outlines /First ${o1} 0 R /Last ${o1} 0 R /Count 1 >>`;
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlines} 0 R /Names << /Dests << /Names [(glossary) [${page2} 0 R /FitH 420]] >> >> >>`;
const info = add("<< /Title (Links sample) /Producer (reader343 build script) >>");

let out = "%PDF-1.7\n";
const offsets = [];
objects.forEach((body, i) => {
  offsets.push(out.length);
  out += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const start = out.length;
out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${start}\n%%EOF\n`;
writeFileSync(new URL("links.pdf", OUT), out, "latin1");
console.log(`links.pdf: ${out.length} bytes`);
