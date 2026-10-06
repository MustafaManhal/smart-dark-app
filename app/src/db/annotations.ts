import { request, transaction } from "./idb";

/** A rectangle in page units: fractions of the page width/height (0..1). */
export type NormRect = { x: number; y: number; w: number; h: number };

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink", "purple"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type Highlight = {
  id: string; bookId: string; page: number; rects: NormRect[]; color: HighlightColor;
  text: string; createdAt: number; updatedAt: number;
};
/** A note attached to a passage of text (separate from highlights). The title is optional. */
export type PassageNote = {
  id: string; bookId: string; page: number; rects: NormRect[]; text: string; body: string;
  title?: string; createdAt: number; updatedAt: number;
};
export type Sticky = {
  id: string; bookId: string; page: number; x: number; y: number; color: HighlightColor;
  text: string; title?: string; collapsed: boolean; createdAt: number; updatedAt: number;
};
export type Bookmark = { id: string; bookId: string; page: number; createdAt: number };

export type BookAnnotations = { highlights: Highlight[]; notes: PassageNote[]; stickies: Sticky[]; bookmarks: Bookmark[] };
export const ANNOTATION_STORES = ["highlights", "notes", "stickies", "bookmarks"] as const;
export type AnnotationStore = (typeof ANNOTATION_STORES)[number];

type Draft<T extends { id: string; createdAt: number }> = Omit<T, "id" | "createdAt" | "updatedAt"> & Partial<Pick<T, "id" | "createdAt">>;

const byPage = (a: { page: number; createdAt: number }, b: { page: number; createdAt: number }) =>
  a.page - b.page || a.createdAt - b.createdAt;

export class AnnotationsRepo {
  constructor(private db: IDBDatabase) {}

  listForBook(bookId: string): Promise<BookAnnotations> {
    return transaction(this.db, [...ANNOTATION_STORES], "readonly", async (tx) => {
      const get = <T>(store: AnnotationStore) => request<T[]>(tx.objectStore(store).index("bookId").getAll(bookId));
      const [highlights, notes, stickies, bookmarks] = await Promise.all([
        get<Highlight>("highlights"), get<PassageNote>("notes"), get<Sticky>("stickies"), get<Bookmark>("bookmarks"),
      ]);
      return {
        highlights: highlights.sort(byPage), notes: notes.sort(byPage),
        stickies: stickies.sort(byPage), bookmarks: bookmarks.sort(byPage),
      };
    });
  }

  all(): Promise<BookAnnotations> {
    return transaction(this.db, [...ANNOTATION_STORES], "readonly", async (tx) => {
      const [highlights, notes, stickies, bookmarks] = await Promise.all(
        ANNOTATION_STORES.map((s) => request<unknown[]>(tx.objectStore(s).getAll())),
      );
      return { highlights, notes, stickies, bookmarks } as BookAnnotations;
    });
  }

  private put<T>(store: AnnotationStore, value: T) {
    return transaction(this.db, [store], "readwrite", async (tx) => {
      await request(tx.objectStore(store).put(value));
      return value;
    });
  }

  putHighlight(draft: Draft<Highlight>): Promise<Highlight> {
    const now = Date.now();
    return this.put("highlights", { ...draft, id: draft.id ?? crypto.randomUUID(), createdAt: draft.createdAt ?? now, updatedAt: now });
  }

  putNote(draft: Draft<PassageNote>): Promise<PassageNote> {
    const now = Date.now();
    return this.put("notes", { ...draft, id: draft.id ?? crypto.randomUUID(), createdAt: draft.createdAt ?? now, updatedAt: now });
  }

  putSticky(draft: Draft<Sticky>): Promise<Sticky> {
    const now = Date.now();
    return this.put("stickies", { ...draft, id: draft.id ?? crypto.randomUUID(), createdAt: draft.createdAt ?? now, updatedAt: now });
  }

  /** Raw insert used by restore: keeps ids and timestamps as they are. */
  restore(store: AnnotationStore, values: unknown[]) {
    return transaction(this.db, [store], "readwrite", async (tx) => {
      for (const v of values) await request(tx.objectStore(store).put(v));
    });
  }

  /** Which of these ids already exist in the store. */
  existing(store: AnnotationStore, ids: string[]): Promise<Set<string>> {
    return transaction(this.db, [store], "readonly", async (tx) => {
      const found = new Set<string>();
      for (const id of ids) if ((await request(tx.objectStore(store).count(id))) > 0) found.add(id);
      return found;
    });
  }

  remove(store: AnnotationStore, id: string) {
    return transaction(this.db, [store], "readwrite", async (tx) => {
      await request(tx.objectStore(store).delete(id));
    });
  }

  /** Adds a bookmark for the page, or removes it if there is one. Returns true when added. */
  toggleBookmark(bookId: string, page: number): Promise<boolean> {
    return transaction(this.db, ["bookmarks"], "readwrite", async (tx) => {
      const store = tx.objectStore("bookmarks");
      const existing = (await request<Bookmark[]>(store.index("bookId").getAll(bookId))).filter((b) => b.page === page);
      if (existing.length) {
        for (const b of existing) await request(store.delete(b.id));
        return false;
      }
      await request(store.put({ id: crypto.randomUUID(), bookId, page, createdAt: Date.now() } satisfies Bookmark));
      return true;
    });
  }
}
