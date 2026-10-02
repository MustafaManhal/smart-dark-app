import type { Book, Progress } from "../db/repos";

export type Shelf = "all" | "reading" | "unread" | "finished";
export type SortKey = "recent" | "title" | "progress";

export function shelfOf(book: Book, progress?: Progress): Exclude<Shelf, "all"> {
  if (book.finishedAt) return "finished";
  return progress ? "reading" : "unread";
}

export function percentRead(book: Book, progress?: Progress): number {
  if (book.finishedAt) return 100;
  if (!progress || book.pageCount <= 0) return 0;
  return Math.round(Math.min(1, progress.page / book.pageCount) * 100);
}

export function filterBooks(
  books: Book[],
  progress: Map<string, Progress>,
  { shelf, query, sort }: { shelf: Shelf; query: string; sort: SortKey },
): Book[] {
  const q = query.trim().toLocaleLowerCase();
  const list = books.filter((book) => {
    if (shelf !== "all" && shelfOf(book, progress.get(book.id)) !== shelf) return false;
    return !q || book.title.toLocaleLowerCase().includes(q) || book.author.toLocaleLowerCase().includes(q);
  });
  const recent = (b: Book) => Math.max(b.lastOpenedAt ?? 0, progress.get(b.id)?.updatedAt ?? 0, b.addedAt);
  const compare: Record<SortKey, (a: Book, b: Book) => number> = {
    recent: (a, b) => recent(b) - recent(a),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    progress: (a, b) => percentRead(b, progress.get(b.id)) - percentRead(a, progress.get(a.id)),
  };
  return list.sort(compare[sort]);
}
