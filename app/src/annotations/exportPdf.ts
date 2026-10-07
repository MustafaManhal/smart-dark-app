import type { BookAnnotations, HighlightColor, NormRect } from "../db/annotations";
import { COLOR_HEX } from "./colors";
import { fromViewRect, type Turn } from "./geometry";

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
export async function exportAnnotatedPdf(bytes: Uint8Array, data: BookAnnotations, password?: string): Promise<Uint8Array> {
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
export const exportCount = (data: BookAnnotations) => data.highlights.length + data.notes.length + data.stickies.length;
