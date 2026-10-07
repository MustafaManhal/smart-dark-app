import type { DrawColor, Drawing } from "../db/drawings";

/** Ink colors, strong enough for a thin line. "ink" follows the page (see .draw-layer in draw.css). */
export const DRAW_HEX: Record<Exclude<DrawColor, "ink">, string> = { red: "#e03131", blue: "#1c7ed6", green: "#2f9e44", orange: "#f08c00" };
export const DRAW_LABEL: Record<DrawColor, string> = { ink: "Ink", red: "Red", blue: "Blue", green: "Green", orange: "Orange" };
/** Thickness choices, as a share of the page's width (about 1, 2.5 and 5 points on a letter-size page). */
export const DRAW_SIZES: [number, string][] = [[0.002, "Thin"], [0.004, "Medium"], [0.008, "Thick"]];
/** Letters of a text box, as a share of the page's width. */
export const TEXT_SIZE = 0.026;

const n = (v: number) => +v.toFixed(2);

/** Drops points that add nothing: closer to the one before than a small share of the page. */
export function thin(points: number[], step = 0.0015): number[] {
  const out = points.slice(0, 3);
  for (let i = 3; i < points.length; i += 3) {
    const last = out.length - 3;
    if (Math.hypot(points[i] - out[last], points[i + 1] - out[last + 1]) >= step || i === points.length - 3) out.push(points[i], points[i + 1], points[i + 2]);
  }
  return out;
}

/**
 * A pen stroke as SVG paths in a box `w` by `h`. A stroke with one pressure all
 * along (mouse, finger) is one smooth path. A pen that pressed harder and
 * softer is drawn piece by piece, each as thick as its pressure.
 */
export function penPaths(points: number[], size: number, w: number, h: number): { d: string; width: number }[] {
  const at = (i: number) => [points[i] * w, points[i + 1] * h, points[i + 2]] as const;
  const count = points.length / 3;
  if (count === 1) {
    const [x, y] = at(0);
    return [{ d: `M${n(x)} ${n(y)}l0.01 0`, width: size * w * 1.4 }];
  }
  const pressures = Array.from({ length: count }, (_, i) => points[i * 3 + 2]);
  const even = Math.max(...pressures) - Math.min(...pressures) < 0.05;
  if (even) {
    // Through the middle of each pair of points, bending at the points: no corners.
    let d = `M${n(at(0)[0])} ${n(at(0)[1])}`;
    for (let i = 1; i < count - 1; i++) {
      const [x, y] = at(i * 3);
      const [nx, ny] = at((i + 1) * 3);
      d += `Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
    }
    const [lx, ly] = at((count - 1) * 3);
    return [{ d: `${d}L${n(lx)} ${n(ly)}`, width: size * w }];
  }
  const pieces: { d: string; width: number }[] = [];
  for (let i = 0; i < count - 1; i++) {
    const [x1, y1, p1] = at(i * 3);
    const [x2, y2, p2] = at((i + 1) * 3);
    pieces.push({ d: `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`, width: size * w * (0.35 + 1.3 * ((p1 + p2) / 2)) });
  }
  return pieces;
}

/** The two short lines of an arrow's head at (x2, y2), for a line that comes from (x1, y1). All in the same units. */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, length: number): [number, number, number, number, number, number] {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const a = angle + Math.PI - 0.45;
  const b = angle + Math.PI + 0.45;
  return [x2 + Math.cos(a) * length, y2 + Math.sin(a) * length, x2, y2, x2 + Math.cos(b) * length, y2 + Math.sin(b) * length];
}

/** Whether a drawing is worth keeping: a dot of the pen is, a shape with no size is not. */
export function worthKeeping(d: Pick<Drawing, "tool" | "points" | "text">): boolean {
  if (d.tool === "pen") return d.points.length >= 3;
  if (d.tool === "text") return !!d.text?.trim();
  return Math.hypot(d.points[2] - d.points[0], d.points[3] - d.points[1]) > 0.008;
}
