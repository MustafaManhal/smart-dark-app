// Smart dark-mode color mapping for rendered PDF pages.
//
// A plain CSS invert() flips every channel, so red turns cyan and photos turn
// into negatives. Here we work in OKLab instead: only perceived lightness is
// flipped, while hue and chroma are kept. White paper becomes the theme
// background, black text becomes the theme foreground, and a red heading stays
// red. Mid-tone saturated colors barely move, so charts and links keep their
// identity. Photos are detected and left untouched (optionally dimmed).

export const THEMES = {
  dark: { label: "Dark", bg: [30, 31, 34], fg: [226, 228, 232] },
  dim: { label: "Dim", bg: [44, 47, 54], fg: [214, 218, 224] },
  black: { label: "Black (OLED)", bg: [0, 0, 0], fg: [214, 214, 214] },
  warm: { label: "Warm night", bg: [36, 32, 28], fg: [232, 220, 200] },
  slate: { label: "Slate blue", bg: [24, 30, 42], fg: [220, 228, 240] },
};

export const IMAGE_MODES = {
  smart: "Smart (keep photos, darken scans)",
  keep: "Keep all images",
  dim: "Dim all images",
  invert: "Darken all images",
};

// ---------- color space helpers (OKLab, Björn Ottosson) ----------

const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb8(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 255;
  const c = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

export function rgbToOklab(r, g, b) {
  const lr = SRGB_TO_LINEAR[r];
  const lg = SRGB_TO_LINEAR[g];
  const lb = SRGB_TO_LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = ([r, g, b]) =>
  r >= -1e-4 && r <= 1.0001 && g >= -1e-4 && g <= 1.0001 && b >= -1e-4 && b <= 1.0001;

// OKLab -> sRGB, reducing chroma (never hue or lightness) until it fits.
export function oklabToRgb(L, a, b) {
  let lin = oklabToLinear(L, a, b);
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(L, a * mid, b * mid))) lo = mid;
      else hi = mid;
    }
    lin = oklabToLinear(L, a * lo, b * lo);
  }
  return [linearToSrgb8(lin[0]), linearToSrgb8(lin[1]), linearToSrgb8(lin[2])];
}

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- the mapping ----------

/**
 * Build a cached color mapper for a theme.
 * @returns {(r:number,g:number,b:number)=>number} packed 0xBBGGRR (little-endian RGBA order)
 */
export function createColorMapper(theme = THEMES.dark, { contrast = 1.5 } = {}) {
  const bg = rgbToOklab(...theme.bg);
  const fg = rgbToOklab(...theme.fg);
  // Starting point for colored content; the exact WCAG check below lifts it
  // further when a color still reads below 4.5:1 on the background.
  const minContentL = Math.min(fg[0], bg[0] + 0.46);
  const bgLum = relativeLuminance(theme.bg);
  const minLum = MIN_CONTRAST * (bgLum + 0.05) - 0.05;
  const cache = new Map();

  function map(r, g, b) {
    const [L, A, B] = rgbToOklab(r, g, b);
    const C = Math.hypot(A, B);

    // Neutral path: slide along the fg..bg line, so paper -> bg and ink -> fg
    // exactly (including any tint the theme has). The exponent pulls mid
    // grays toward the foreground so gray captions stay readable.
    const t = L ** contrast;
    const nL = fg[0] + (bg[0] - fg[0]) * t;
    const na = fg[1] + (bg[1] - fg[1]) * t;
    const nb = fg[2] + (bg[2] - fg[2]) * t;

    // How "colorful" the pixel is. Grays and anti-aliased text edges stay ~0.
    const colorful = smoothstep(0.008, 0.06, C);
    if (colorful === 0) return pack(oklabToRgb(nL, na, nb));

    // In a light document, anything clearly darker than paper is content
    // (text, lines, chart marks): flip it like ink but never below a readable
    // lightness. Anything close to paper lightness is a fill (highlighter,
    // pastel table row): darken it like paper, but a little less, so it still
    // stands out from the page.
    const contentL = clamp(nL, minContentL, fg[0]);
    const fillL = nL + 0.11 * colorful;
    const fillWeight = smoothstep(0.76, 0.86, L);
    const targetL = contentL + (fillL - contentL) * fillWeight;
    const outL = nL + (targetL - nL) * colorful;

    // Keep hue and chroma; blend the theme tint in only for weakly colored
    // pixels. Darkened fills get extra chroma: the same chroma looks duller
    // at low lightness, so pastel boxes would otherwise turn muddy.
    const boost = 1 + 0.8 * fillWeight;
    const outA = A * boost * colorful + na * (1 - colorful);
    const outB = B * boost * colorful + nb * (1 - colorful);
    let out = oklabToRgb(outL, outA, outB);

    // Text-like colors must meet WCAG AA contrast against the page. Saturated
    // blues and reds have lower luminance than their OKLab lightness suggests,
    // so search for the smallest lift that gets there.
    if (colorful * (1 - fillWeight) > 0.5 && relativeLuminance(out) < minLum) {
      let lo = outL;
      let hi = fg[0];
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        if (relativeLuminance(oklabToRgb(mid, outA, outB)) < minLum) lo = mid;
        else hi = mid;
      }
      out = oklabToRgb(hi, outA, outB);
    }
    return pack(out);
  }

  return function mapColor(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) {
      if (cache.size > 500000) cache.clear();
      v = map(r, g, b);
      cache.set(key, v);
    }
    return v;
  };
}

export const TINTS = {
  sepia: { label: "Sepia", paper: [244, 236, 216], ink: [70, 52, 36] },
};

/**
 * Light page styles (sepia): no inversion. Lightness is squeezed into the
 * ink..paper range and neutrals take the tint, so white paper becomes warm
 * paper and black text becomes brown ink; colors keep hue and chroma.
 */
export function createTintMapper(tint = TINTS.sepia) {
  const paper = rgbToOklab(...tint.paper);
  const ink = rgbToOklab(...tint.ink);
  const cache = new Map();

  function map(r, g, b) {
    const [L, A, B] = rgbToOklab(r, g, b);
    const C = Math.hypot(A, B);
    const outL = ink[0] + (paper[0] - ink[0]) * L;
    const na = ink[1] + (paper[1] - ink[1]) * L;
    const nb = ink[2] + (paper[2] - ink[2]) * L;
    const colorful = smoothstep(0.008, 0.06, C);
    return pack(oklabToRgb(outL, A * colorful + na * (1 - colorful), B * colorful + nb * (1 - colorful)));
  }

  return function mapColor(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) {
      if (cache.size > 500000) cache.clear();
      v = map(r, g, b);
      cache.set(key, v);
    }
    return v;
  };
}

const pack = ([r, g, b]) => (b << 16) | (g << 8) | r;

const MIN_CONTRAST = 4.6; // WCAG AA is 4.5; small margin for 8-bit rounding

function relativeLuminance([r, g, b]) {
  return 0.2126 * SRGB_TO_LINEAR[r] + 0.7152 * SRGB_TO_LINEAR[g] + 0.0722 * SRGB_TO_LINEAR[b];
}

// ---------- image regions ----------

/**
 * Convert pdf.js `imageCoordinates` (normalized parallelograms, 6 numbers per
 * image: p0, p1, p2) into integer pixel rectangles.
 */
export function imageRectsFromCoords(coords, width, height) {
  const rects = [];
  if (!coords) return rects;
  for (let i = 0; i + 5 < coords.length; i += 6) {
    const x0 = coords[i] * width, y0 = coords[i + 1] * height;
    const x1 = coords[i + 2] * width, y1 = coords[i + 3] * height;
    const x2 = coords[i + 4] * width, y2 = coords[i + 5] * height;
    const x3 = x1 + x2 - x0, y3 = y1 + y2 - y0; // fourth corner
    // Only pixels the image fully covers. Edge pixels are part image, part
    // white paper; keeping them would draw a light seam around a kept photo,
    // so they go through the color mapper with the page instead. The epsilon
    // absorbs float16/float32 rounding in pdf.js's coordinates.
    const eps = 0.05;
    const left = Math.max(0, Math.ceil(Math.min(x0, x1, x2, x3) - eps));
    const top = Math.max(0, Math.ceil(Math.min(y0, y1, y2, y3) - eps));
    const right = Math.min(width, Math.floor(Math.max(x0, x1, x2, x3) + eps));
    const bottom = Math.min(height, Math.floor(Math.max(y0, y1, y2, y3) + eps));
    if (right - left >= 2 && bottom - top >= 2) rects.push({ left, top, right, bottom });
  }
  return rects;
}

/**
 * Decide whether an image region looks like a photo/illustration (keep its
 * colors) or like a document: a scan, a screenshot of text, a chart on white
 * (darken it like the rest of the page).
 */
export function classifyRegion(px32, width, rect) {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  let total = 0, paper = 0, ink = 0, gray = 0;
  for (let y = rect.top; y < rect.bottom; y += step) {
    const row = y * width;
    for (let x = rect.left; x < rect.right; x += step) {
      const p = px32[row + x];
      const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
      const max = r > g ? (r > b ? r : b) : g > b ? g : b;
      const min = r < g ? (r < b ? r : b) : g < b ? g : b;
      const sat = max - min;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      total++;
      if (sat < 28) {
        gray++;
        if (luma > 205) paper++;
        else if (luma < 90) ink++;
      }
    }
  }
  if (!total) return "photo";
  const paperRatio = paper / total;
  const grayRatio = gray / total;
  // Lots of near-white paper and mostly gray content => document-like.
  if (paperRatio > 0.5 && grayRatio > 0.75) return "document";
  if (paperRatio > 0.62) return "document"; // chart / diagram on white
  return "photo";
}

// pdf.js keeps image coordinates as float16 when available, which can be a
// pixel or two off on a large canvas. Grow each side while the line just
// outside still looks like image rather than white paper.
export function refineRect(px32, width, height, rect, maxGrow = 2) {
  const isPaperLine = (x0, y0, x1, y1) => {
    let paper = 0, total = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const p = px32[y * width + x];
        const r = p & 255, g = (p >> 8) & 255, b = (p >> 16) & 255;
        if (r > 235 && g > 235 && b > 235) paper++;
        total++;
      }
    }
    return paper * 2 >= total;
  };
  const out = { ...rect };
  for (let i = 0; i < maxGrow && out.top > 0 && !isPaperLine(out.left, out.top - 1, out.right, out.top); i++) out.top--;
  for (let i = 0; i < maxGrow && out.bottom < height && !isPaperLine(out.left, out.bottom, out.right, out.bottom + 1); i++) out.bottom++;
  for (let i = 0; i < maxGrow && out.left > 0 && !isPaperLine(out.left - 1, out.top, out.left, out.bottom); i++) out.left--;
  for (let i = 0; i < maxGrow && out.right < width && !isPaperLine(out.right, out.top, out.right + 1, out.bottom); i++) out.right++;
  return out;
}

// ---------- page processing ----------

/**
 * Recolor a rendered page in place.
 * @param {ImageData} imageData
 * @param {{mapColor:Function, rects?:Array, imageMode?:string, imageDim?:number}} opts
 */
export function processPage(imageData, { mapColor, rects = [], imageMode = "smart", imageDim = 0.85 }) {
  const { width, height } = imageData;
  const px = new Uint32Array(imageData.data.buffer, imageData.data.byteOffset, width * height);

  // 0 = recolor, 1 = keep, 2 = dim
  let mask = null;
  if (rects.length && imageMode !== "invert") {
    mask = new Uint8Array(width * height);
    for (const rect of rects) {
      let mode;
      if (imageMode === "keep") mode = 1;
      else if (imageMode === "dim") mode = 2;
      else mode = classifyRegion(px, width, rect) === "photo" ? 2 : 0;
      if (mode === 0) continue;
      const r = refineRect(px, width, height, rect);
      for (let y = r.top; y < r.bottom; y++) {
        mask.fill(mode, y * width + r.left, y * width + r.right);
      }
    }
  }

  const dim = Math.round(clamp(imageDim, 0, 1) * 256);
  let lastIn = -1, lastOut = 0;
  for (let i = 0, n = px.length; i < n; i++) {
    const p = px[i];
    const m = mask ? mask[i] : 0;
    if (m === 1) continue;
    if (m === 2) {
      if (dim < 256) {
        const r = ((p & 255) * dim) >> 8;
        const g = (((p >> 8) & 255) * dim) >> 8;
        const b = (((p >> 16) & 255) * dim) >> 8;
        px[i] = (p & 0xff000000) | (b << 16) | (g << 8) | r;
      }
      continue;
    }
    const rgb = p & 0xffffff;
    if (rgb !== lastIn) {
      lastIn = rgb;
      lastOut = mapColor(p & 255, (p >> 8) & 255, (p >> 16) & 255);
    }
    px[i] = (p & 0xff000000) | lastOut;
  }
  return imageData;
}
