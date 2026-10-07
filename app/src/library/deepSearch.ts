import type { BookAnnotations } from "../db/annotations";
import type { Book, Repos } from "../db/repos";
import { closePdf, openPdf } from "../reader/pdf";
import { BookSearch, findInPage, fold } from "../reader/search";

export type Snippet = { before: string; hit: string; after: string };

/** The first place `query` appears in `text`, with some of the words around it. Null when it does not. */
export function snippet(text: string, query: string, around = 50): Snippet | null {
  const needle = fold(query).folded;
  if (!needle) return null;
  const { folded, map } = fold(text);
  const at = folded.indexOf(needle);
  if (at === -1) return null;
  const start = map[at];
  const end = map[at + needle.length] ?? text.length;
  const tidy = (s: string) => s.replace(/\s+/g, " ");
  const before = tidy(text.slice(Math.max(0, start - around), start)).trimStart();
  const after = tidy(text.slice(end, end + around)).trimEnd();
  return { before: (start > around ? "…" : "") + before, hit: tidy(text.slice(start, end)), after: after + (end + around < text.length ? "…" : "") };
}

export type NoteHit = Snippet & { id: string; bookId: string; page: number; kind: "highlight" | "note" | "sticky" };

/** Looks for `query` in everything the reader wrote or marked, in all books. */
export function searchNotes(all: BookAnnotations, query: string, max = 40): NoteHit[] {
  const hits: NoteHit[] = [];
  const look = (kind: NoteHit["kind"], item: { id: string; bookId: string; page: number }, texts: (string | undefined)[]) => {
    for (const text of texts) {
      const found = text ? snippet(text, query) : null;
      if (!found) continue;
      hits.push({ ...found, id: item.id, bookId: item.bookId, page: item.page, kind });
      return;
    }
  };
  // The reader's own words first, then the passages they marked.
  for (const n of all.notes) look("note", n, [n.title, n.body, n.text]);
  for (const s of all.stickies) look("sticky", s, [s.title, s.text]);
  for (const h of all.highlights) look("highlight", h, [h.text]);
  return hits.slice(0, max);
}

export type BookHits = { book: Book; count: number; first: (Snippet & { page: number })[] };

/**
 * Looks for `query` in the text of every book, one book after the other. The
 * PDFs are opened only for the time of the search. `stop.now` ends it early.
 */
export async function searchInsideBooks(
  repos: Pick<Repos, "books">, books: Book[], query: string,
  onUpdate: (found: BookHits[], done: number, now: Book | null) => void, stop: { now: boolean },
): Promise<BookHits[]> {
  const found: BookHits[] = [];
  for (const [i, book] of books.entries()) {
    if (stop.now) break;
    onUpdate([...found], i, book);
    const file = await repos.books.file(book.id);
    if (!file) continue;
    let doc: Awaited<ReturnType<typeof openPdf>> | null = null;
    try {
      doc = await openPdf(new Uint8Array(await file.arrayBuffer()), book.password);
      const search = new BookSearch(doc);
      const hits: BookHits = { book, count: 0, first: [] };
      for (let n = 1; n <= doc.numPages && !stop.now; n++) {
        const matches = findInPage(await search.page(n), query, n);
        hits.count += matches.length;
        for (const m of matches) {
          if (hits.first.length < 3) hits.first.push({ page: m.page, before: m.before, hit: m.hit, after: m.after });
        }
        if (n % 20 === 0) await new Promise((r) => setTimeout(r, 0)); // let the screen breathe
      }
      if (hits.count) found.push(hits);
    } catch {
      // A book that cannot be opened (a protected one whose password is gone) is passed over.
    } finally {
      await closePdf(doc);
    }
  }
  onUpdate([...found], books.length, null);
  return found;
}
