import type { BookAnnotations, HighlightColor, MarkStyle } from "../db/annotations";
import type { Book } from "../db/repos";
import { fold } from "../reader/search";

export type NotebookKind = "highlight" | "note" | "sticky";

/** One thing the reader marked or wrote, with the book it is in. */
export type NotebookItem = {
  id: string;
  kind: NotebookKind;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  tags: string[];
  page: number;
  color?: HighlightColor;
  style?: MarkStyle;
  /** The words of the book that were marked ("" for a sticky note or a marked area). */
  passage: string;
  /** What the reader wrote: the note's body or the sticky note's text. */
  note: string;
  title: string;
  updatedAt: number;
};

/** Everything marked in every book, as one flat list. Marks of a book that was removed are left out. */
export function notebookItems(all: BookAnnotations, books: Book[]): NotebookItem[] {
  const byId = new Map(books.map((b) => [b.id, b]));
  const items: NotebookItem[] = [];
  const push = (bookId: string, rest: Omit<NotebookItem, "bookId" | "bookTitle" | "bookAuthor" | "tags">) => {
    const book = byId.get(bookId);
    if (book) items.push({ ...rest, bookId, bookTitle: book.title, bookAuthor: book.author, tags: book.tags ?? [] });
  };
  for (const h of all.highlights) {
    push(h.bookId, { id: h.id, kind: "highlight", page: h.page, color: h.color, style: h.style, passage: h.text, note: "", title: "", updatedAt: h.updatedAt });
  }
  for (const n of all.notes) {
    push(n.bookId, { id: n.id, kind: "note", page: n.page, passage: n.text, note: n.body, title: n.title ?? "", updatedAt: n.updatedAt });
  }
  for (const s of all.stickies) {
    push(s.bookId, { id: s.id, kind: "sticky", page: s.page, color: s.color, passage: "", note: s.text, title: s.title ?? "", updatedAt: s.updatedAt });
  }
  return items;
}

export type NotebookFilter = { kind: NotebookKind | "all"; bookId: string | null; tag: string | null; query: string; sort: "book" | "newest" };

export function filterNotebook(items: NotebookItem[], { kind, bookId, tag, query, sort }: NotebookFilter): NotebookItem[] {
  const words = fold(query).folded.trim().split(" ").filter(Boolean);
  const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;
  const found = items.filter((item) => {
    if (kind !== "all" && item.kind !== kind) return false;
    if (bookId && item.bookId !== bookId) return false;
    if (tag && !item.tags.some((x) => same(x, tag))) return false;
    if (!words.length) return true;
    const text = fold([item.title, item.note, item.passage, item.bookTitle].join(" ")).folded;
    return words.every((w) => text.includes(w));
  });
  return found.sort(sort === "newest"
    ? (a, b) => b.updatedAt - a.updatedAt
    : (a, b) => a.bookTitle.localeCompare(b.bookTitle, undefined, { sensitivity: "base", numeric: true }) || a.bookId.localeCompare(b.bookId) || a.page - b.page || a.updatedAt - b.updatedAt);
}

/** The items in groups of one book each, in the order the items come. */
export function byBook(items: NotebookItem[]): { bookId: string; title: string; author: string; items: NotebookItem[] }[] {
  const groups: { bookId: string; title: string; author: string; items: NotebookItem[] }[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.bookId === item.bookId);
    if (!group) groups.push((group = { bookId: item.bookId, title: item.bookTitle, author: item.bookAuthor, items: [] }));
    group.items.push(item);
  }
  return groups;
}

const KIND_WORD: Record<NotebookKind, string> = { highlight: "Highlight", note: "Note", sticky: "Sticky note" };

/** Markdown: a heading for each book, then its marks in page order. */
export function notebookMarkdown(items: NotebookItem[]): string {
  const lines: string[] = [];
  for (const group of byBook(items)) {
    lines.push(`# ${group.title}${group.author ? ` (${group.author})` : ""}`, "");
    for (const item of group.items) {
      const head = `p. ${item.page}${item.title ? `: **${item.title}**` : ""}`;
      if (item.kind === "highlight") lines.push(`- ${head} ${item.passage ? `“${item.passage}”` : "(marked area)"}`);
      else lines.push(`- ${head}`, ...(item.passage ? [`  > ${item.passage}`] : []), ...(item.note.trim() ? [`  ${item.note.trim().replace(/\n/g, "\n  ")}`] : []));
    }
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** A spreadsheet file (CSV, with the mark that tells Excel it is UTF-8). */
export function notebookCsv(items: NotebookItem[]): string {
  const rows = [["Book", "Author", "Page", "Kind", "Color", "Title", "Passage", "Note", "Tags", "Changed"]];
  for (const item of items) {
    rows.push([item.bookTitle, item.bookAuthor, String(item.page), KIND_WORD[item.kind], item.color ?? "", item.title, item.passage, item.note,
      item.tags.join("; "), new Date(item.updatedAt).toISOString().slice(0, 10)]);
  }
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

/**
 * A text file Anki imports as cards (File, Import). The front is the passage
 * (or the note's title), the back is the note and where it comes from. Tabs
 * and line breaks inside a field become spaces and <br>, as the format asks.
 */
export function notebookAnki(items: NotebookItem[]): string {
  const field = (text: string) => text.replace(/\t/g, " ").replace(/\r?\n/g, "<br>").trim();
  const tag = (text: string) => text.trim().replace(/\s+/g, "_");
  const lines = ["#separator:tab", "#html:true", "#columns:Front\tBack\tTags", "#tags column:3"];
  for (const item of items) {
    const front = item.passage || item.title || item.note;
    if (!front.trim()) continue; // a marked area alone has nothing to ask
    const source = `${item.bookTitle}${item.bookAuthor ? `, ${item.bookAuthor}` : ""}, p. ${item.page}`;
    const back = [item.passage && item.title ? item.title : "", item.passage || item.title ? item.note : "", `<i>${source}</i>`].filter((x) => x.trim()).join("\n\n");
    lines.push([field(front), field(back), ["Reader343", tag(item.bookTitle), ...item.tags.map(tag)].join(" ")].join("\t"));
  }
  return lines.join("\n") + "\n";
}
