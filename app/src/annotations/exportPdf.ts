import type { BookAnnotations, HighlightColor, NormRect } from "../db/annotations";
import { COLOR_HEX } from "./colors";
import type { DrawColor, Drawing } from "../db/drawings";
import { arrowHead, DRAW_HEX, TEXT_SIZE } from "../draw/shapes";
import { fromViewPoint, fromViewRect, type Turn } from "./geometry";

/**
 * A copy of the PDF with the reader's marks inside it, as standard PDF
 * annotations: highlights, underlines, strikethroughs and notes that other
 * apps (Acrobat, Preview, a browser) show and can edit. Each mark also carries
 * its own drawing (an appearance stream), because not every app draws a mark
 * that comes without one.
 *
 * A protected PDF is opened with its password and the copy is saved without
 * protection: the person exporting it has the password.
 */
export async function exportAnnotatedPdf(bytes: Uint8Array, data: BookAnnotations, password?: string, drawings: Drawing[] = []): Promise<Uint8Array> {
  // Loaded only when someone exports: the library is large.
  const { PDFDocument, PDFString, PDFHexString } = await import("@cantoo/pdf-lib");
  const doc = await PDFDocument.load(bytes, { password, updateMetadata: false });
  const context = doc.context;
  const pages = doc.getPages();
  const stamp = PDFString.fromDate(new Date());
  const text = (value: string) => PDFHexString.fromText(value);

  const rgb = (color: HighlightColor) => {
    const hex = COLOR_HEX[color];
    return [1, 3, 5].map((i) => +(parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  };
  const n = (v: number) => +v.toFixed(2);

  for (const [index, page] of pages.entries()) {
    const number = index + 1;
    // Marks are kept in fractions of the page as it is shown upright: the crop box, turned by the page's own /Rotate.
    const box = page.getCropBox();
    const turn = ((((page.getRotation().angle % 360) + 360) % 360) as Turn);
    /** A stored rectangle in PDF units: [left, bottom, right, top]. */
    const place = (rect: NormRect): [number, number, number, number] => {
      const r = fromViewRect(rect, turn);
      const left = box.x + r.x * box.width;
      const top = box.y + (1 - r.y) * box.height;
      return [n(left), n(top - r.h * box.height), n(left + r.w * box.width), n(top)];
    };
    const around = (boxes: number[][]) => [
      Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
    ];
    const add = (dict: Record<string, unknown>) => page.node.addAnnot(context.register(context.obj(dict as never)));
    /** A drawing for a mark: page coordinates, clipped to the mark's rectangle. */
    const drawing = (rect: number[], operators: string, multiply = false) => context.register(context.stream(operators, {
      Type: "XObject", Subtype: "Form", FormType: 1, BBox: rect,
      Resources: multiply ? { ExtGState: { Mark: { Type: "ExtGState", BM: "Multiply" } } } : {},
    }));

    const marks = [
      ...data.highlights.filter((h) => h.page === number).map((h) => ({ rects: h.rects, color: h.color, style: h.style ?? "highlight", contents: "" })),
      // A note on a passage is a highlight that carries the note's words.
      ...data.notes.filter((note) => note.page === number).map((note) => ({
        rects: note.rects, color: "yellow" as HighlightColor, style: "highlight" as const,
        contents: [note.title, note.body].filter(Boolean).join("\n\n"),
      })),
    ];
    for (const mark of marks) {
      const boxes = mark.rects.map(place).filter((b) => b[2] > b[0] && b[3] > b[1]);
      if (!boxes.length) continue;
      const color = rgb(mark.color);
      const rect = around(boxes);
      // Four corners for each line of the mark: top left, top right, bottom left, bottom right.
      const quads = boxes.flatMap(([l, b, r, t]) => [l, t, r, t, l, b, r, b]);
      let ops: string;
      if (mark.style === "highlight") {
        ops = `/Mark gs ${color.join(" ")} rg ${boxes.map(([l, b, r, t]) => `${l} ${b} ${n(r - l)} ${n(t - b)} re`).join(" ")} f`;
      } else {
        // A line under the words, or through their middle.
        const at = (b: number, t: number) => n(mark.style === "underline" ? b + (t - b) * 0.08 : b + (t - b) * 0.45);
        const width = n(Math.max(0.8, Math.min(...boxes.map(([, b, , t]) => t - b)) * 0.07));
        ops = `${color.join(" ")} RG ${width} w ${boxes.map(([l, b, r, t]) => `${l} ${at(b, t)} m ${r} ${at(b, t)} l`).join(" ")} S`;
      }
      add({
        Type: "Annot",
        Subtype: mark.style === "underline" ? "Underline" : mark.style === "strike" ? "StrikeOut" : "Highlight",
        Rect: rect, QuadPoints: quads, C: color, F: 4, M: stamp, T: text("Reader343"),
        ...(mark.contents ? { Contents: text(mark.contents) } : {}),
        AP: { N: drawing(rect, ops, mark.style === "highlight") },
      });
    }

    // Drawings: pen strokes as ink, shapes as the PDF's own line, square and circle, text boxes as free text.
    const viewWidth = turn % 180 ? box.height : box.width;
    const spot = (x: number, y: number): [number, number] => {
      const [px, py] = fromViewPoint(x, y, turn);
      return [n(box.x + px * box.width), n(box.y + (1 - py) * box.height)];
    };
    for (const d of drawings.filter((x) => x.page === number)) {
      const color = d.color === "ink" ? [0, 0, 0] : [1, 3, 5].map((i) => +(parseInt(DRAW_HEX[d.color as Exclude<DrawColor, "ink">].slice(i, i + 2), 16) / 255).toFixed(4));
      const width = n(Math.max(0.5, d.size * viewWidth));
      const pen = `${color.join(" ")} RG ${width} w 1 J 1 j`;
      const padded = (xs: number[], ys: number[], by = width) => [n(Math.min(...xs) - by), n(Math.min(...ys) - by), n(Math.max(...xs) + by), n(Math.max(...ys) + by)];
      const base = { Type: "Annot", C: color, F: 4, M: stamp, T: text("Reader343"), BS: { W: width } };
      if (d.tool === "pen") {
        const pts = Array.from({ length: d.points.length / 3 }, (_, i) => spot(d.points[i * 3], d.points[i * 3 + 1]));
        const rect = padded(pts.map((p) => p[0]), pts.map((p) => p[1]));
        const path = pts.map(([x, y], i) => `${x} ${y} ${i ? "l" : "m"}`).join(" ") + (pts.length === 1 ? ` ${pts[0][0] + 0.01} ${pts[0][1]} l` : "");
        add({ ...base, Subtype: "Ink", Rect: rect, InkList: [pts.flat()], AP: { N: drawing(rect, `${pen} ${path} S`) } });
      } else if (d.tool === "text") {
        const [x, top] = spot(d.points[0], d.points[1]);
        const size = n(TEXT_SIZE * viewWidth * (d.size / 0.004) ** 0.5);
        const words = d.text ?? "";
        const lines = words.split("\n");
        const rect = [x, n(top - size * 1.35 * lines.length - 4), n(x + Math.max(...lines.map((l) => l.length)) * size * 0.6 + 8), top];
        // No drawing of its own: the other app lays the words out with its fonts (which also covers Arabic).
        add({ Type: "Annot", Subtype: "FreeText", Rect: rect, Contents: text(words), DA: PDFString.of(`/Helv ${size} Tf ${color.join(" ")} rg`), F: 4, M: stamp, T: text("Reader343") });
      } else {
        const [x1, y1] = spot(d.points[0], d.points[1]);
        const [x2, y2] = spot(d.points[2], d.points[3]);
        const [l, b, r, t] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
        if (d.tool === "rect") {
          const rect = padded([l, r], [b, t]);
          add({ ...base, Subtype: "Square", Rect: rect, AP: { N: drawing(rect, `${pen} ${l} ${b} ${n(r - l)} ${n(t - b)} re S`) } });
        } else if (d.tool === "ellipse") {
          const rect = padded([l, r], [b, t]);
          const [cx, cy, rx, ry, k] = [(l + r) / 2, (b + t) / 2, (r - l) / 2, (t - b) / 2, 0.5523];
          const c = (...v: number[]) => v.map(n).join(" ");
          const oval = `${c(cx + rx, cy)} m ${c(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry)} c ${c(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy)} c `
            + `${c(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry)} c ${c(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy)} c`;
          add({ ...base, Subtype: "Circle", Rect: rect, AP: { N: drawing(rect, `${pen} ${oval} S`) } });
        } else {
          const head = Math.max(width * 4, viewWidth * 0.018);
          const [ax, ay, tx, ty, bx, by] = arrowHead(x1, y1, x2, y2, head).map(n);
          const rect = padded([x1, x2], [y1, y2], width + (d.tool === "arrow" ? head : 0));
          const arrow = d.tool === "arrow" ? ` ${ax} ${ay} m ${tx} ${ty} l ${bx} ${by} l` : "";
          add({ ...base, Subtype: "Line", Rect: rect, L: [x1, y1, x2, y2], ...(d.tool === "arrow" ? { LE: ["None", "OpenArrow"] } : {}),
            AP: { N: drawing(rect, `${pen} ${x1} ${y1} m ${x2} ${y2} l${arrow} S`) } });
        }
      }
    }

    for (const sticky of data.stickies.filter((s) => s.page === number)) {
      // A sticky note is a comment icon at its place; the words open in the other app's comment view.
      const [left, , , top] = place({ x: sticky.x, y: sticky.y, w: 0, h: 0 });
      add({
        Type: "Annot", Subtype: "Text", Name: "Note", Open: false,
        Rect: [n(left), n(top - 20), n(left + 20), n(top)], C: rgb(sticky.color), F: 28, M: stamp, T: text("Reader343"),
        Contents: text([sticky.title, sticky.text].filter(Boolean).join("\n\n")),
      });
    }
  }
  return doc.save({ useObjectStreams: true });
}

/** How many marks an export would carry (bookmarks are not part of a PDF's annotations). */
export const exportCount = (data: BookAnnotations, drawings: Drawing[] = []) =>
  data.highlights.length + data.notes.length + data.stickies.length + drawings.length;
