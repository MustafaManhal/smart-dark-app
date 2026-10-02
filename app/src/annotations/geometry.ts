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
