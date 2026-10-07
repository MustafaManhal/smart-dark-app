import type { PDFDocumentProxy } from "./pdf";

/** Where the ink of a page starts and ends, in shares of the page (0 to 1). */
export type Box = { l: number; t: number; r: number; b: number };

/**
 * How much of each side crop margins cuts away, in shares of the page. Left
 * and right are kept apart for odd and even pages, because a printed book has
 * its wide margin on alternating sides.
 */
export type Crop = { odd: [l: number, r: number]; even: [l: number, r: number]; t: number; b: number };

export const NO_CUT = { l: 0, r: 0, t: 0, b: 0 };

export function cutFor(crop: Crop | null, page: number) {
  if (!crop) return NO_CUT;
  const [l, r] = page % 2 ? crop.odd : crop.even;
  return { l, r, t: crop.t, b: crop.b };
}

const DIFFERENT = 28; // a pixel this far from the paper color is ink

/** The box around everything that is not paper, or null for an empty page. `data` is RGBA. */
export function contentBox(data: Uint8ClampedArray, width: number, height: number): Box | null {
  // The paper is the color most of the outer edge has.
  const counts = new Map<number, number>();
  const edge = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < width; x++) { edge(x, 0); edge(x, height - 1); }
  for (let y = 0; y < height; y++) { edge(0, y); edge(width - 1, y); }
  let paper = 0;
  let most = 0;
  for (const [key, n] of counts) if (n > most) { most = n; paper = key; }
  const pr = ((paper >> 10) << 3) + 4;
  const pg = (((paper >> 5) & 31) << 3) + 4;
  const pb = ((paper & 31) << 3) + 4;

  let l = width, r = -1, t = height, b = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (Math.abs(data[i] - pr) + Math.abs(data[i + 1] - pg) + Math.abs(data[i + 2] - pb) < DIFFERENT) continue;
      if (x < l) l = x;
      if (x > r) r = x;
      if (y < t) t = y;
      if (y > b) b = y;
    }
  }
  if (r < 0) return null;
  return { l: l / width, t: t / height, r: (r + 1) / width, b: (b + 1) / height };
}

const FULL = 0.97;  // a page filled this far is a cover or a scan, not text with margins
const PAD = 0.015;  // air left around the text
const GAIN = 0.04;  // less than this to cut is not worth a different layout

/**
 * One crop for the whole book from the ink boxes of its pages, so that no
 * measured page loses ink. Null when there is nothing worth cutting.
 */
export function bookCrop(pages: { page: number; box: Box | null }[]): Crop | null {
  let inked = pages.filter((p): p is { page: number; box: Box } => !!p.box);
  const full = inked.filter(({ box }) => box.r - box.l > FULL && box.b - box.t > FULL);
  // A few full pages are covers and plates and may lose their edge. Many of them: a scanned book, leave it alone.
  if (full.length > inked.length * 0.2) return null;
  inked = inked.filter((p) => !full.includes(p));
  if (!inked.length) return null;

  const span = (group: typeof inked) => group.length
    ? { l: Math.min(...group.map((p) => p.box.l)), r: Math.max(...group.map((p) => p.box.r)) }
    : null;
  const odd = span(inked.filter((p) => p.page % 2 === 1)) ?? span(inked)!;
  const even = span(inked.filter((p) => p.page % 2 === 0)) ?? span(inked)!;
  // Both kinds of page get the same width, so the pages line up and one zoom fits all.
  const width = Math.min(1, Math.max(odd.r - odd.l, even.r - even.l) + 2 * PAD);
  const sides = ({ l, r }: { l: number; r: number }): [number, number] => {
    const left = Math.min(1 - width, Math.max(0, (l + r) / 2 - width / 2));
    return [round(left), round(1 - width - left)];
  };
  const t = round(Math.max(0, Math.min(...inked.map((p) => p.box.t)) - PAD));
  const b = round(Math.max(0, 1 - Math.max(...inked.map((p) => p.box.b)) - PAD));
  if (1 - width < GAIN && t + b < GAIN) return null;
  return { odd: sides(odd), even: sides(even), t, b };
}

const round = (n: number) => Math.round(Math.max(0, n) * 1000) / 1000;

const MEASURE_WIDTH = 140; // pixels; one is under 1% of the page
const MAX_PAGES = 300;

/** The pages to measure: all of a normal book, evenly spread pairs (odd and even) of a very long one. */
export function pagesToMeasure(total: number, max = MAX_PAGES): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  const pairs = Math.floor(max / 2);
  const pages = new Set<number>();
  for (let i = 0; i < pairs; i++) {
    const first = 1 + Math.floor((i * (total - 2)) / (pairs - 1));
    pages.add(first);
    pages.add(first + 1);
  }
  return [...pages].sort((a, b) => a - b);
}

/** Measures the margins of a book by drawing its pages very small in their own colors. */
export async function measureCrop(
  doc: PDFDocumentProxy, onProgress: (done: number, total: number) => void = () => {}, stop: { now: boolean } = { now: false },
): Promise<Crop | null> {
  const pages = pagesToMeasure(doc.numPages);
  const boxes: { page: number; box: Box | null }[] = [];
  const canvas = document.createElement("canvas");
  for (const [i, n] of pages.entries()) {
    if (stop.now) return null;
    onProgress(i, pages.length);
    try {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: MEASURE_WIDTH / base.width });
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      boxes.push({ page: n, box: contentBox(image.data, canvas.width, canvas.height) });
    } catch {
      // A page that cannot be drawn says nothing about the margins.
    }
  }
  canvas.width = canvas.height = 0;
  return bookCrop(boxes);
}
