// Draws the extension icon at every size Chrome needs, with 4x4 supersampling.
// The page is split: left half light (original), right half dark (smart dark),
// and the colored lines keep their hue on both sides.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { encodePng } from "./png.mjs";

const OUT = new URL("../src/icons/", import.meta.url);
mkdirSync(OUT, { recursive: true });

function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

// Three lines of text, one in each of the app's marking colors. Light half, dark half: the same hue on both.
const LINES = [
  { y: 0.37, x1: 0.69, light: [222, 76, 66], dark: [255, 138, 128] },
  { y: 0.5, x1: 0.61, light: [67, 83, 216], dark: [154, 165, 255] },
  { y: 0.63, x1: 0.66, light: [31, 150, 88], dark: [107, 214, 151] },
];
const LINE_X0 = 0.31;
const LINE_R = 0.033; // half the thickness; the ends are round

// The tile is ink that gets a little deeper toward the bottom.
const tile = (y) => {
  const t = Math.max(0, Math.min(1, y));
  return [Math.round(27 - 11 * t), Math.round(29 - 12 * t), Math.round(40 - 17 * t), 255];
};
const PAPER = [251, 250, 247, 255];
const NIGHT = [38, 40, 50, 255];

// Returns [r,g,b,a] for a point in unit space. `square`: the tile fills the
// whole image with no rounding (iOS and Android apply their own mask).
function sample(x, y, square = false) {
  if (square && (x < 0 || x > 1 || y < 0 || y > 1)) return tile(y);
  if (!square && !roundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.225)) return [0, 0, 0, 0];
  const page = roundRect(x, y, 0.215, 0.14, 0.785, 0.86, 0.07);
  if (!page) return tile(y);
  const darkSide = x >= 0.5;
  for (const line of LINES) {
    // A capsule: every point within LINE_R of the segment from LINE_X0 to x1.
    const nearest = Math.max(LINE_X0, Math.min(x, line.x1));
    if ((x - nearest) ** 2 + (y - line.y) ** 2 <= LINE_R ** 2) return [...(darkSide ? line.dark : line.light), 255];
  }
  return darkSide ? NIGHT : PAPER;
}

// Chrome Web Store asks for 96x96 artwork inside the 128x128 icon (16px
// transparent padding), so the large icon gets an inset.
function draw(size, inset = 0, square = false) {
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
          const [cr, cg, cb, ca] = sample(u, v, square);
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
// Desktop app icon (macOS/Windows): 1024px with the macOS grid margin (~10%).
mkdirSync(new URL("../build/", import.meta.url), { recursive: true });
writeFileSync(new URL("../build/icon.png", import.meta.url), encodePng(1024, 1024, draw(1024, 100 / 1024)));
// Web app (PWA) icons.
const web = new URL("../app/public/icons/", import.meta.url);
mkdirSync(web, { recursive: true });
writeFileSync(new URL("icon-192.png", web), encodePng(192, 192, draw(192)));
writeFileSync(new URL("icon-512.png", web), encodePng(512, 512, draw(512)));
// Maskable: opaque, artwork inside the central 80% safe zone.
writeFileSync(new URL("maskable-512.png", web), encodePng(512, 512, draw(512, 0.14, true), { alpha: false }));
// iOS home screen: opaque square, iOS rounds the corners itself.
writeFileSync(new URL("apple-touch-icon.png", web), encodePng(180, 180, draw(180, 0.08, true), { alpha: false }));
writeFileSync(new URL("favicon-32.png", web), encodePng(32, 32, draw(32)));

// Microsoft Store package (MSIX): the tiles Windows shows on Start, in the taskbar and in the Store.
// The mark sits in the middle of the app's dark tile color; the names are the ones electron-builder looks for.
function drawTile(width, height, share, ss = 4) {
  const side = Math.min(width, height) * share;
  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (px + (sx + 0.5) / ss - (width - side) / 2) / side;
          const v = (py + (sy + 0.5) / ss - (height - side) / 2) / side;
          const [cr, cg, cb] = sample(u, v, true);
          r += cr; g += cg; b += cb;
        }
      }
      const i = (py * width + px) * 4;
      rgba[i] = Math.round(r / (ss * ss));
      rgba[i + 1] = Math.round(g / (ss * ss));
      rgba[i + 2] = Math.round(b / (ss * ss));
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}
const appx = new URL("../build/appx/", import.meta.url);
mkdirSync(appx, { recursive: true });
for (const [name, width, height, share] of [
  ["StoreLogo", 50, 50, 1.3], ["Square44x44Logo", 44, 44, 1.3], ["SmallTile", 71, 71, 1.25], ["Square150x150Logo", 150, 150, 1.1],
  ["Wide310x150Logo", 310, 150, 1.1], ["LargeTile", 310, 310, 1.05], ["SplashScreen", 620, 300, 0.9],
]) {
  writeFileSync(new URL(`${name}.png`, appx), encodePng(width, height, drawTile(width, height, share), { alpha: false }));
}
// iPhone app (Capacitor project in ios/): the icon, a full square without see-through corners (iOS rounds
// it itself), and the picture shown while the app starts: the mark, small, on the app's dark color.
const iosAssets = new URL("../ios/App/App/Assets.xcassets/", import.meta.url);
if (existsSync(iosAssets)) {
  writeFileSync(new URL("AppIcon.appiconset/AppIcon-512@2x.png", iosAssets), encodePng(1024, 1024, draw(1024, 0.08, true), { alpha: false }));
  const splash = encodePng(2732, 2732, drawTile(2732, 2732, 0.14, 1), { alpha: false });
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) writeFileSync(new URL(`Splash.imageset/${name}`, iosAssets), splash);
}

// Store listings: Edge Add-ons asks for a square logo (300x300), the Microsoft Store takes the same as its app tile.
mkdirSync(new URL("../store/", import.meta.url), { recursive: true });
writeFileSync(new URL("../store/logo-300.png", import.meta.url), encodePng(300, 300, draw(300)));
console.log("icons written to src/icons/, build/icon.png, build/appx/, store/logo-300.png and app/public/icons/");
