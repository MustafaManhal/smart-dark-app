import type { BookAnnotations, Bookmark, Highlight, HighlightColor, PassageNote, Sticky } from "../db/annotations";

export type NoteKind = "highlights" | "notes" | "sticky" | "bookmarks";

export type NoteItem =
  | { type: "highlight"; id: string; page: number; item: Highlight }
  | { type: "note"; id: string; page: number; item: PassageNote }
  | { type: "sticky"; id: string; page: number; item: Sticky }
  | { type: "bookmark"; id: string; page: number; item: Bookmark };

const top = (rects: { y: number }[]) => (rects.length ? Math.min(...rects.map((r) => r.y)) : 0);

/** One kind of annotation, filtered and in reading order. */
export function noteItems(
  data: BookAnnotations,
  { kind, color, query }: { kind: NoteKind; color: HighlightColor | null; query: string },
): NoteItem[] {
  const q = query.trim().toLocaleLowerCase();
  const matches = (...texts: string[]) => !q || texts.some((t) => t.toLocaleLowerCase().includes(q));
  const items: NoteItem[] = [];
  if (kind === "highlights") {
    for (const h of data.highlights) {
      if ((!color || h.color === color) && matches(h.text)) items.push({ type: "highlight", id: h.id, page: h.page, item: h });
    }
  } else if (kind === "notes") {
    for (const n of data.notes) if (matches(n.text, n.body)) items.push({ type: "note", id: n.id, page: n.page, item: n });
  } else if (kind === "sticky") {
    for (const s of data.stickies) {
      if ((!color || s.color === color) && matches(s.text)) items.push({ type: "sticky", id: s.id, page: s.page, item: s });
    }
  } else if (!q) {
    for (const b of data.bookmarks) items.push({ type: "bookmark", id: b.id, page: b.page, item: b });
  }
  const y = (e: NoteItem) => (e.type === "highlight" || e.type === "note" ? top(e.item.rects) : e.type === "sticky" ? e.item.y : 0);
  return items.sort((a, b) => a.page - b.page || y(a) - y(b));
}

export function counts(data: BookAnnotations): Record<NoteKind, number> {
  return { highlights: data.highlights.length, notes: data.notes.length, sticky: data.stickies.length, bookmarks: data.bookmarks.length };
}
