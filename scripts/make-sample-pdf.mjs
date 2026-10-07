// Builds src/sample/sample.pdf: a two-page document that exercises everything
// the smart dark mode has to handle (black text, colored text, highlights,
// pastel table fills, a chart, a photo and a scanned-text image).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const OUT = new URL("../src/sample/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const W = 595, H = 842;
const esc = (s) => s.replace(/[\\()]/g, (m) => "\\" + m);
const rgb = (r, g, b) => `${(r / 255).toFixed(3)} ${(g / 255).toFixed(3)} ${(b / 255).toFixed(3)}`;

function text(x, y, size, str, { font = "F1", color = [0, 0, 0] } = {}) {
  return `BT /${font} ${size} Tf ${rgb(...color)} rg ${x} ${y} Td (${esc(str)}) Tj ET\n`;
}
const rect = (x, y, w, h, color) => `${rgb(...color)} rg ${x} ${y} ${w} ${h} re f\n`;
const line = (x1, y1, x2, y2, color, width = 1) =>
  `${rgb(...color)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;

// ---- images
function photo(w, h) {
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      // sunset sky: purple -> orange
      let r = 90 + 165 * t, g = 50 + 90 * t, b = 140 - 60 * t;
      const sun = Math.hypot(x - w * 0.62, y - h * 0.62) / (h * 0.16);
      if (sun < 1) { r = 255; g = 214 - 30 * sun; b = 90; }
      const hill = h * (0.7 + 0.08 * Math.sin(x / w * 7) + 0.04 * Math.sin(x / w * 19));
      if (y > hill) { r = 24 + 20 * Math.sin(x * 0.3); g = 70 + (y - hill) * 0.5; b = 40; }
      const lake = y > h * 0.88;
      if (lake) { r = 40; g = 90; b = 150 + 40 * Math.sin(x * 0.5 + y); }
      const i = (y * w + x) * 3;
      px[i] = Math.max(0, Math.min(255, r));
      px[i + 1] = Math.max(0, Math.min(255, g));
      px[i + 2] = Math.max(0, Math.min(255, b));
    }
  }
  return px;
}

function scan(w, h) {
  const px = Buffer.alloc(w * h * 3, 250);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 9; row++) {
    const y0 = 14 + row * 16;
    let x = 12;
    while (x < w - 30) {
      const word = 10 + Math.floor(rand() * 34);
      for (let y = y0; y < y0 + 7; y++) {
        for (let xx = x; xx < Math.min(x + word, w - 12); xx++) {
          if (rand() > 0.25) px.fill(30 + Math.floor(rand() * 40), (y * w + xx) * 3, (y * w + xx) * 3 + 3);
        }
      }
      x += word + 6;
    }
  }
  return px;
}

// ---- page 1 content
let p1 = "";
p1 += text(56, 778, 26, "Quarterly Reading Report", { font: "F2", color: [16, 42, 112] });
p1 += text(56, 756, 11, "Reader343 sample - toggle with the D key to compare with the original.", { color: [110, 110, 110] });
p1 += line(56, 744, 539, 744, [200, 200, 200]);

p1 += rect(56, 709, 236, 15, [255, 240, 80]); // highlighter
const body = [
  "Black body text becomes light gray on a dark page. The highlighted",
  "words keep a visible yellow band, and colored words keep their hue:",
];
p1 += text(58, 713, 11, body[0]);
p1 += text(58, 697, 11, body[1]);
p1 += text(58, 679, 11, "Red warning", { font: "F2", color: [204, 0, 0] });
p1 += text(140, 679, 11, "Green success", { font: "F2", color: [0, 128, 0] });
p1 += text(236, 679, 11, "Purple note", { font: "F2", color: [128, 0, 128] });
p1 += text(320, 679, 11, "https://example.com/link", { color: [6, 69, 173] });
p1 += line(320, 677, 450, 677, [6, 69, 173], 0.6);

// chart
p1 += text(56, 640, 14, "Revenue by region", { font: "F2", color: [16, 42, 112] });
const bars = [[120, [229, 57, 53]], [180, [30, 136, 229]], [90, [67, 160, 71]], [150, [251, 140, 0]], [60, [142, 36, 170]]];
p1 += line(70, 440, 330, 440, [60, 60, 60]);
p1 += line(70, 440, 70, 630, [60, 60, 60]);
for (let i = 0; i < 4; i++) p1 += line(70, 480 + i * 40, 330, 480 + i * 40, [225, 225, 225], 0.5);
bars.forEach(([h, c], i) => {
  p1 += rect(86 + i * 48, 440, 32, h, c);
  p1 += text(90 + i * 48, 426, 9, ["N", "S", "E", "W", "C"][i], { color: [80, 80, 80] });
});

// photo
p1 += `q 200 0 0 133 340 470 cm /Im1 Do Q\n`;
p1 += text(340, 456, 9, "Photo: kept in its real colors.", { color: [110, 110, 110] });

// pastel table
const tableTop = 400;
const cols = [56, 216, 336, 456];
p1 += rect(56, tableTop - 20, 483, 20, [210, 228, 252]);
["Region", "Readers", "Growth", "Status"].forEach((h, i) => (p1 += text(cols[i] + 6, tableTop - 14, 10, h, { font: "F2" })));
const rows = [["North", "12,400", "+8%", "On track"], ["South", "9,100", "-2%", "Watch"], ["East", "15,250", "+14%", "Ahead"]];
rows.forEach((row, r) => {
  const y = tableTop - 20 - (r + 1) * 20;
  if (r % 2 === 0) p1 += rect(56, y, 483, 20, [246, 247, 250]);
  row.forEach((cell, i) => {
    const color = i === 2 ? (cell.startsWith("-") ? [204, 0, 0] : [0, 128, 0]) : [0, 0, 0];
    p1 += text(cols[i] + 6, y + 6, 10, cell, { color });
  });
});
p1 += rect(456, tableTop - 80, 83, 20, [255, 228, 225]); // pink "Watch" cell
p1 += text(462, tableTop - 74, 10, "Watch", { font: "F2", color: [150, 30, 30] });

// scanned text image
p1 += text(56, 290, 14, "Scanned page excerpt", { font: "F2", color: [16, 42, 112] });
p1 += `q 260 0 0 120 56 160 cm /Im2 Do Q\n`;
p1 += text(56, 146, 9, "Scans and screenshots of text are darkened like the page.", { color: [110, 110, 110] });
p1 += text(56, 100, 11, "Gray captions, thin rules and table lines stay readable.", { color: [120, 120, 120] });

// ---- page 2
let p2 = text(56, 778, 20, "Page two", { font: "F2", color: [16, 42, 112] });
const para = [
  "Long documents render lazily: only the pages near the screen are drawn,",
  "so even large books open quickly. Select text, follow links, and use",
  "the zoom controls or Ctrl + scroll. Your theme choice applies everywhere.",
];
para.forEach((l, i) => (p2 += text(56, 740 - i * 18, 12, l)));
p2 += rect(56, 640, 483, 40, [232, 245, 233]);
p2 += text(68, 655, 12, "Tip: press D to see the original colors.", { font: "F2", color: [27, 94, 32] });

// ---- assemble
const objects = [];
const add = (body) => objects.push(body) && objects.length;
const stream = (dict, data) => {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
  return Buffer.concat([Buffer.from(`<< ${dict} /Length ${buf.length} >>\nstream\n`, "latin1"), buf, Buffer.from("\nendstream", "latin1")]);
};

const catalog = add(null);
const pagesId = add(null);
const font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
const font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
const im1 = add(stream("/Type /XObject /Subtype /Image /Width 300 /Height 200 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", deflateSync(photo(300, 200))));
const im2 = add(stream("/Type /XObject /Subtype /Image /Width 260 /Height 160 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode", deflateSync(scan(260, 160))));
const res = `<< /Font << /F1 ${font1} 0 R /F2 ${font2} 0 R >> /XObject << /Im1 ${im1} 0 R /Im2 ${im2} 0 R >> >>`;
const c1 = add(stream("/Filter /FlateDecode", deflateSync(Buffer.from(p1, "latin1"))));
const c2 = add(stream("/Filter /FlateDecode", deflateSync(Buffer.from(p2, "latin1"))));
const link = add("<< /Type /Annot /Subtype /Link /Rect [318 674 452 690] /Border [0 0 0] /A << /S /URI /URI (https://example.com/link) >> >>");
const page1 = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${c1} 0 R /Annots [${link} 0 R] >>`);
const page2 = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources ${res} /Contents ${c2} 0 R >>`);
const outlines = add(null);
const o1 = add(null);
const o2 = add(null);
objects[outlines - 1] = `<< /Type /Outlines /First ${o1} 0 R /Last ${o2} 0 R /Count 2 >>`;
objects[o1 - 1] = `<< /Title (Quarterly report) /Parent ${outlines} 0 R /Next ${o2} 0 R /Dest [${page1} 0 R /Fit] >>`;
objects[o2 - 1] = `<< /Title (Page two) /Parent ${outlines} 0 R /Prev ${o1} 0 R /Dest [${page2} 0 R /Fit] >>`;
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`;
objects[pagesId - 1] = `<< /Type /Pages /Kids [${page1} 0 R ${page2} 0 R] /Count 2 >>`;
const info = add("<< /Title (Reader343 sample) /Producer (reader343 build script) >>");

const parts = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
let offset = parts[0].length;
const offsets = [];
objects.forEach((body, i) => {
  const head = Buffer.from(`${i + 1} 0 obj\n`, "latin1");
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1");
  const tail = Buffer.from("\nendobj\n", "latin1");
  offsets.push(offset);
  parts.push(head, content, tail);
  offset += head.length + content.length + tail.length;
});
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const o of offsets) xref += `${String(o).padStart(10, "0")} 00000 n \n`;
xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
parts.push(Buffer.from(xref, "latin1"));
writeFileSync(new URL("sample.pdf", OUT), Buffer.concat(parts));
console.log("wrote src/sample/sample.pdf");
