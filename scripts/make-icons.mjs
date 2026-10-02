// Draws the extension icon at every size Chrome needs, with 4x4 supersampling.
// The page is split: left half light (original), right half dark (smart dark),
// and the colored lines keep their hue on both sides.
import { mkdirSync, writeFileSync } from "node:fs";
import { encodePng } from "./png.mjs";

const OUT = new URL("../src/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

const LINES = [
  { y: 0.36, x1: 0.68, light: [214, 48, 49], dark: [255, 122, 110] },
  { y: 0.5, x1: 0.62, light: [24, 119, 242], dark: [122, 167, 255] },
  { y: 0.64, x1: 0.66, light: [22, 150, 70], dark: [96, 205, 128] },
];

// Returns [r,g,b,a] for a point in unit space.
function sample(x, y) {
  if (!roundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return [0, 0, 0, 0];
  const page = roundRect(x, y, 0.2, 0.13, 0.8, 0.87, 0.06);
  if (!page) return [24, 27, 36, 255]; // tile
  const darkSide = x >= 0.5;
  for (const line of LINES) {
    if (Math.abs(y - line.y) <= 0.035 && x >= 0.3 && x <= line.x1) {
      return [...(darkSide ? line.dark : line.light), 255];
    }
  }
  return darkSide ? [44, 48, 60, 255] : [240, 242, 246, 255];
}

// Chrome Web Store asks for 96x96 artwork inside the 128x128 icon (16px
// transparent padding), so the large icon gets an inset.
function draw(size, inset = 0) {
  const ss = 4;
  const span = 1 - 2 * inset;
  const rgba = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = ((px + (sx + 0.5) / ss) / size - inset) / span;
          const v = ((py + (sy + 0.5) / ss) / size - inset) / span;
          const [cr, cg, cb, ca] = sample(u, v);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const i = (py * size + px) * 4;
      if (a) {
        rgba[i] = Math.round(r / a);
        rgba[i + 1] = Math.round(g / a);
        rgba[i + 2] = Math.round(b / a);
      }
      rgba[i + 3] = Math.round(a / (ss * ss));
    }
  }
  return rgba;
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon${size}.png`, OUT), encodePng(size, size, draw(size, size === 128 ? 16 / 128 : 0)));
}
console.log("icons written to src/icons/");
