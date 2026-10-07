import type { NormRect } from "../db/annotations";

type Box = { left: number; top: number; width: number; height: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round = (v: number) => Math.round(v * 1e5) / 1e5;

/**
 * Turns selection client rects into page fractions. Rects that sit on the same
 * line (vertical overlap over half their height) are merged into one band, so a
 * highlight draws as one block per line instead of one per text span.
 */
export function normalizeRects(rects: Iterable<Box>, page: Box): NormRect[] {
  const lines: { left: number; top: number; right: number; bottom: number }[] = [];
  const sorted = [...rects]
    .filter((r) => r.width > 0.5 && r.height > 0.5)
    .map((r) => ({ left: r.left, top: r.top, right: r.left + r.width, bottom: r.top + r.height }))
    .sort((a, b) => a.top - b.top || a.left - b.left);
  for (const r of sorted) {
    const line = lines.find((l) => {
      const overlap = Math.min(l.bottom, r.bottom) - Math.max(l.top, r.top);
      return overlap > 0.5 * Math.min(l.bottom - l.top, r.bottom - r.top);
    });
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else lines.push({ ...r });
  }
  return lines
    .map((l) => {
      const x1 = clamp01((l.left - page.left) / page.width);
      const x2 = clamp01((l.right - page.left) / page.width);
      const y1 = clamp01((l.top - page.top) / page.height);
      const y2 = clamp01((l.bottom - page.top) / page.height);
      return { x: round(x1), y: round(y1), w: round(x2 - x1), h: round(y2 - y1) };
    })
    .filter((n) => n.w > 0 && n.h > 0);
}

export function rectToCss(r: NormRect) {
  const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

/** A quarter turn of the page, clockwise, in degrees. */
export type Turn = 0 | 90 | 180 | 270;

/**
 * Everything stored about a page (highlights, notes, links) is measured on the
 * page as the PDF has it. These two turn a point between that page and the
 * page as it is shown after the reader rotated it. All in page fractions.
 */
export function toViewPoint(x: number, y: number, turn: Turn): [number, number] {
  return turn === 90 ? [1 - y, x] : turn === 180 ? [1 - x, 1 - y] : turn === 270 ? [y, 1 - x] : [x, y];
}

export function fromViewPoint(u: number, v: number, turn: Turn): [number, number] {
  return turn === 90 ? [v, 1 - u] : turn === 180 ? [1 - u, 1 - v] : turn === 270 ? [1 - v, u] : [u, v];
}

function turnRect(r: NormRect, turn: Turn, point: typeof toViewPoint): NormRect {
  if (!turn) return r;
  const [x1, y1] = point(r.x, r.y, turn);
  const [x2, y2] = point(r.x + r.w, r.y + r.h, turn);
  return { x: round(Math.min(x1, x2)), y: round(Math.min(y1, y2)), w: round(Math.abs(x2 - x1)), h: round(Math.abs(y2 - y1)) };
}

export const toViewRect = (r: NormRect, turn: Turn) => turnRect(r, turn, toViewPoint);
export const fromViewRect = (r: NormRect, turn: Turn) => turnRect(r, turn, fromViewPoint);

/** The four cut margins of a page, as they lie after the page is turned. */
export function turnCut<T extends { l: number; r: number; t: number; b: number }>(cut: T, turn: Turn) {
  const { l, r, t, b } = cut;
  return turn === 90 ? { t: l, r: t, b: r, l: b } : turn === 180 ? { t: b, r: l, b: t, l: r } : turn === 270 ? { t: r, r: b, b: l, l: t } : { l, r, t, b };
}
