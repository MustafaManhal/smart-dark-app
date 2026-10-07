import type { Book, Progress } from "../db/repos";

export type Shelf = "all" | "reading" | "unread" | "finished" | "favorites";
export type SortKey = "recent" | "title" | "progress";

export function shelfOf(book: Book, progress?: Progress): Exclude<Shelf, "all" | "favorites"> {
  if (book.finishedAt) return "finished";
  return progress ? "reading" : "unread";
}

export function percentRead(book: Book, progress?: Progress): number {
  if (book.finishedAt) return 100;
  if (!progress || book.pageCount <= 0) return 0;
  // An e-book has no pages: it keeps how far through the text the reader is.
  if (progress.fraction !== undefined) return Math.round(progress.fraction * 100);
  return Math.round(Math.min(1, progress.page / book.pageCount) * 100);
}

const recent = (book: Book, progress: Map<string, Progress>) =>
  Math.max(book.lastOpenedAt ?? 0, progress.get(book.id)?.updatedAt ?? 0, book.addedAt);

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

export function filterBooks(
  books: Book[],
  progress: Map<string, Progress>,
  { shelf, query, sort, tag = null }: { shelf: Shelf; query: string; sort: SortKey; tag?: string | null },
): Book[] {
  const q = query.trim().toLocaleLowerCase();
  const list = books.filter((book) => {
    if (shelf === "favorites" ? !book.favorite : shelf !== "all" && shelfOf(book, progress.get(book.id)) !== shelf) return false;
    if (tag && !book.tags?.some((x) => same(x, tag))) return false;
    return !q || [book.title, book.author, ...(book.tags ?? [])].some((text) => text.toLocaleLowerCase().includes(q));
  });
  const compare: Record<SortKey, (a: Book, b: Book) => number> = {
    recent: (a, b) => recent(b, progress) - recent(a, progress),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    progress: (a, b) => percentRead(b, progress.get(b.id)) - percentRead(a, progress.get(a.id)),
  };
  return list.sort(compare[sort]);
}

/** The books being read, the one opened last first. */
export function continueReading(books: Book[], progress: Map<string, Progress>, max = 3): Book[] {
  return books
    .filter((book) => shelfOf(book, progress.get(book.id)) === "reading")
    .sort((a, b) => recent(b, progress) - recent(a, progress))
    .slice(0, max);
}

/** Every tag in the library, once, in alphabetical order. "Physics" and "physics" are one tag. */
export function allTags(books: Book[]): string[] {
  const tags: string[] = [];
  for (const tag of books.flatMap((book) => book.tags ?? [])) {
    if (!tags.some((x) => same(x, tag))) tags.push(tag);
  }
  return tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }));
}

/** Tags as typed in one field ("physics, exam 2026") to a clean list. */
export function parseTags(text: string): string[] {
  const tags: string[] = [];
  for (const part of text.split(/[,،;\n]/)) {
    const tag = part.replace(/\s+/g, " ").trim().slice(0, 40);
    if (tag && !tags.some((x) => same(x, tag))) tags.push(tag);
  }
  return tags.slice(0, 12);
}
