import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEMES,
  createColorMapper,
  rgbToOklab,
  imageRectsFromCoords,
  classifyRegion,
  processPage,
  refineRect,
  createTintMapper,
  TINTS,
  ADJUST_DEFAULTS,
  createAdjuster,
  createPlainMapper,
  adjustColor,
} from "../../src/viewer/smart-invert.js";

const unpack = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255];

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function hue(rgb) {
  const [, a, b] = rgbToOklab(...rgb);
  return (Math.atan2(b, a) * 180) / Math.PI;
}

const hueDelta = (h1, h2) => Math.abs(((h1 - h2 + 540) % 360) - 180);

for (const [name, theme] of Object.entries(THEMES)) {
  test(`${name}: paper maps to the theme background and ink to the foreground`, () => {
    const map = createColorMapper(theme);
    assert.deepEqual(unpack(map(255, 255, 255)), theme.bg);
    assert.deepEqual(unpack(map(0, 0, 0)), theme.fg);
  });

  test(`${name}: colored text keeps its hue and stays readable`, () => {
    const map = createColorMapper(theme);
    const inks = {
      red: [204, 0, 0],
      green: [0, 128, 0],
      blue: [0, 0, 255],
      link: [6, 69, 173],
      navy: [16, 42, 112],
      purple: [128, 0, 128],
      orange: [255, 140, 0],
    };
    for (const [ink, rgb] of Object.entries(inks)) {
      const out = unpack(map(...rgb));
      assert.ok(hueDelta(hue(rgb), hue(out)) < 8, `${ink} hue drifted: ${rgb} -> ${out}`);
      assert.ok(contrast(out, theme.bg) >= 4.5, `${ink} contrast ${contrast(out, theme.bg).toFixed(2)} < 4.5`);
    }
  });
}

test("highlighter stays visible and text on it stays readable", () => {
  const theme = THEMES.dark;
  const map = createColorMapper(theme);
  const band = unpack(map(255, 240, 80));
  assert.ok(contrast(band, theme.bg) > 1.4, "highlight band disappears into the page");
  assert.ok(contrast(theme.fg, band) >= 4.5, "text on the highlight is unreadable");
  assert.ok(hueDelta(hue([255, 240, 80]), hue(band)) < 10);
});

test("anti-aliased edges ramp monotonically (no halos)", () => {
  const map = createColorMapper(THEMES.dark);
  for (const base of [[255, 0, 0], [0, 0, 255], [0, 128, 0], [0, 0, 0]]) {
    let previous = Infinity;
    for (let i = 0; i <= 20; i++) {
      const a = i / 20;
      const c = base.map((v) => Math.round(v + (255 - v) * a));
      const L = rgbToOklab(...unpack(map(...c)))[0];
      assert.ok(L <= previous + 0.005, `ramp from ${base} rises at step ${i}`);
      previous = L;
    }
  }
});

test("image coordinates become clamped pixel rectangles", () => {
  // pdf.js gives p0, p1, p2 of a parallelogram in 0..1 canvas units.
  const coords = new Float32Array([0.1, 0.2, 0.1, 0.5, 0.6, 0.2, -0.1, -0.1, -0.1, 0.3, 0.3, -0.1]);
  const rects = imageRectsFromCoords(coords, 1000, 1000);
  assert.deepEqual(rects[0], { left: 100, top: 200, right: 600, bottom: 500 });
  assert.deepEqual(rects[1], { left: 0, top: 0, right: 300, bottom: 300 });
  // Partly covered edge pixels are left out.
  const [inner] = imageRectsFromCoords([0.1005, 0.2005, 0.1005, 0.4995, 0.5995, 0.2005], 1000, 1000);
  assert.deepEqual(inner, { left: 101, top: 201, right: 599, bottom: 499 });
});

function fakePage(width, height, fill) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

test("photos are classified as photos, scans as documents", () => {
  const photo = fakePage(100, 100, (x, y) => [80 + x, 40 + y, 150 - y]);
  const scan = fakePage(100, 100, (x, y) => (y % 10 < 2 && x % 7 < 5 ? [30, 30, 30] : [250, 250, 250]));
  const rect = { left: 0, top: 0, right: 100, bottom: 100 };
  const px = (img) => new Uint32Array(img.data.buffer);
  assert.equal(classifyRegion(px(photo), 100, rect), "photo");
  assert.equal(classifyRegion(px(scan), 100, rect), "document");
});

test("processPage recolors the page but leaves photo pixels alone", () => {
  const img = fakePage(40, 20, (x) => (x < 20 ? [255, 255, 255] : [200, 60 + x, 30]));
  const rects = [{ left: 20, top: 0, right: 40, bottom: 20 }];
  const map = createColorMapper(THEMES.dark);
  processPage(img, { mapColor: map, rects, imageMode: "keep" });
  assert.deepEqual([...img.data.slice(0, 3)], THEMES.dark.bg);
  const i = (5 * 40 + 30) * 4;
  assert.deepEqual([...img.data.slice(i, i + 3)], [200, 90, 30]);
});

test("refineRect grows into image pixels but stops at white paper", () => {
  // 20x20 page: image occupies x 5..14, y 5..14; the box we get is 1px short on top/left.
  const img = fakePage(20, 20, (x, y) => (x >= 5 && x < 15 && y >= 5 && y < 15 ? [90, 40, 120] : [255, 255, 255]));
  const px = new Uint32Array(img.data.buffer);
  const r = refineRect(px, 20, 20, { left: 6, top: 6, right: 15, bottom: 15 });
  assert.deepEqual(r, { left: 5, top: 5, right: 15, bottom: 15 });
});

test("sepia: paper and ink map to the tint colors", () => {
  const map = createTintMapper(TINTS.sepia);
  assert.deepEqual(unpack(map(255, 255, 255)), TINTS.sepia.paper);
  assert.deepEqual(unpack(map(0, 0, 0)), TINTS.sepia.ink);
});

test("sepia: colors keep their hue and do not invert", () => {
  const map = createTintMapper(TINTS.sepia);
  for (const rgb of [[204, 0, 0], [0, 0, 255], [0, 128, 0]]) {
    const out = unpack(map(...rgb));
    assert.ok(hueDelta(hue(rgb), hue(out)) < 10, `${rgb} -> ${out}`);
    const [Lin] = rgbToOklab(...rgb);
    const [Lout] = rgbToOklab(...out);
    assert.ok(Math.abs(Lin - Lout) < 0.2, "lightness should stay close in a light theme");
  }
});

test("adjust: default values need no adjuster", () => {
  assert.equal(createAdjuster(), null);
  assert.equal(createAdjuster({ ...ADJUST_DEFAULTS }), null);
  assert.deepEqual(adjustColor([12, 34, 56], null), [12, 34, 56]);
});

test("adjust: brightness scales every channel", () => {
  assert.deepEqual(createAdjuster({ brightness: 50 })(200, 100, 50), [100, 50, 25]);
  assert.deepEqual(createAdjuster({ brightness: 150 })(200, 100, 50), [255, 150, 75]);
});

test("adjust: contrast moves colors away from or toward middle gray", () => {
  const more = createAdjuster({ contrast: 150 });
  assert.deepEqual(more(255, 128, 0), [255, 128, 0]);
  assert.deepEqual(more(200, 100, 50), [236, 86, 11]);
  const less = createAdjuster({ contrast: 50 });
  assert.deepEqual(less(255, 128, 0), [191, 128, 64]);
});

test("adjust: full grayscale removes color, half keeps the hue", () => {
  assert.deepEqual(createAdjuster({ grayscale: 100 })(255, 0, 0), [54, 54, 54]);
  assert.deepEqual(createAdjuster({ grayscale: 100 })(255, 255, 255), [255, 255, 255]);
  const [r, g, b] = createAdjuster({ grayscale: 50 })(255, 0, 0);
  assert.ok(r > g && g === b && g > 0, `${[r, g, b]}`);
});

test("adjust: sepia warms white paper and keeps black ink black", () => {
  const sepia = createAdjuster({ sepia: 100 });
  assert.deepEqual(sepia(255, 255, 255), [255, 255, 239]);
  assert.deepEqual(sepia(0, 0, 0), [0, 0, 0]);
  const [r, g, b] = createAdjuster({ sepia: 50 })(...THEMES.dark.bg);
  assert.ok(r > g && g > b, `dark paper should turn warm: ${[r, g, b]}`);
});

test("adjust: brightness runs before contrast (Dark Reader order)", () => {
  // 200 * 0.5 = 100, then (100/255 - 0.5) * 1.5 + 0.5 = 0.3382 -> 86
  assert.deepEqual(createAdjuster({ brightness: 50, contrast: 150 })(200, 200, 200), [86, 86, 86]);
});

test("adjust: values outside the ranges are clamped, bad values ignored", () => {
  assert.deepEqual(createAdjuster({ brightness: 10 })(200, 100, 50), [100, 50, 25]);
  assert.deepEqual(createAdjuster({ grayscale: 500 })(255, 0, 0), [54, 54, 54]);
  assert.equal(createAdjuster({ brightness: "abc", sepia: NaN }), null);
});

test("adjust: mappers apply it after the color mapping", () => {
  const dim = createAdjuster({ brightness: 50 });
  const half = (rgb) => rgb.map((c) => Math.round(c / 2));
  const dark = createColorMapper(THEMES.dark, { adjust: dim });
  assert.deepEqual(unpack(dark(255, 255, 255)), half(THEMES.dark.bg));
  assert.deepEqual(unpack(dark(0, 0, 0)), half(THEMES.dark.fg));
  const tint = createTintMapper(TINTS.sepia, { adjust: dim });
  assert.deepEqual(unpack(tint(255, 255, 255)), half(TINTS.sepia.paper));
  const plain = createPlainMapper(dim);
  assert.deepEqual(unpack(plain(200, 100, 50)), [100, 50, 25]);
  assert.deepEqual(unpack(createPlainMapper()(200, 100, 50)), [200, 100, 50]);
});

test("adjust: without an adjuster the mappers give the same colors as before", () => {
  const a = createColorMapper(THEMES.dark);
  const b = createColorMapper(THEMES.dark, { adjust: createAdjuster(ADJUST_DEFAULTS) });
  for (const rgb of [[255, 255, 255], [0, 0, 0], [204, 0, 0], [120, 130, 140], [255, 240, 150]]) {
    assert.equal(a(...rgb), b(...rgb));
  }
});

test("adjust: photos are not adjusted", () => {
  const img = fakePage(40, 20, (x) => (x < 20 ? [255, 255, 255] : [200, 60 + x, 30]));
  const rects = [{ left: 20, top: 0, right: 40, bottom: 20 }];
  const map = createColorMapper(THEMES.dark, { adjust: createAdjuster({ grayscale: 100, brightness: 50 }) });
  processPage(img, { mapColor: map, rects, imageMode: "keep" });
  const i = (5 * 40 + 30) * 4;
  assert.deepEqual([...img.data.slice(i, i + 3)], [200, 90, 30]);
  assert.notDeepEqual([...img.data.slice(0, 3)], THEMES.dark.bg);
});
