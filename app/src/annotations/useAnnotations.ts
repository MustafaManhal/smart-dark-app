import { useCallback, useEffect, useState } from "preact/hooks";
import type { BookAnnotations, Bookmark, Highlight, PassageNote, Sticky } from "../db/annotations";
import type { Repos } from "../db/repos";

const EMPTY: BookAnnotations = { highlights: [], notes: [], stickies: [], bookmarks: [] };

/** Annotation state for one book, kept in sync with IndexedDB. */
export function useAnnotations(repos: Repos, bookId: string) {
  const [data, setData] = useState<BookAnnotations>(EMPTY);
  const reload = useCallback(() => repos.annotations.listForBook(bookId).then(setData), [bookId]);
  useEffect(() => {
    reload();
  }, [reload]);

  const replace = <K extends keyof BookAnnotations>(key: K, item: BookAnnotations[K][number]) =>
    setData((d) => ({ ...d, [key]: [...d[key].filter((x) => x.id !== item.id), item].sort((a, b) => a.page - b.page) }));

  return {
    data,
    reload,
    async saveHighlight(h: Parameters<Repos["annotations"]["putHighlight"]>[0]) {
      const saved = await repos.annotations.putHighlight(h);
      replace("highlights", saved);
      return saved;
    },
    async removeHighlight(h: Highlight) {
      await repos.annotations.remove("highlights", h.id);
      setData((d) => ({ ...d, highlights: d.highlights.filter((x) => x.id !== h.id) }));
    },
    async saveNote(n: Parameters<Repos["annotations"]["putNote"]>[0]) {
      const saved = await repos.annotations.putNote(n);
      replace("notes", saved);
      return saved;
    },
    async removeNote(n: PassageNote) {
      await repos.annotations.remove("notes", n.id);
      setData((d) => ({ ...d, notes: d.notes.filter((x) => x.id !== n.id) }));
    },
    async removeBookmark(b: Bookmark) {
      await repos.annotations.remove("bookmarks", b.id);
      setData((d) => ({ ...d, bookmarks: d.bookmarks.filter((x) => x.id !== b.id) }));
    },
    async saveSticky(s: Parameters<Repos["annotations"]["putSticky"]>[0]) {
      const saved = await repos.annotations.putSticky(s);
      replace("stickies", saved);
      return saved;
    },
    async removeSticky(s: Sticky) {
      await repos.annotations.remove("stickies", s.id);
      setData((d) => ({ ...d, stickies: d.stickies.filter((x) => x.id !== s.id) }));
    },
    async toggleBookmark(page: number) {
      await repos.annotations.toggleBookmark(bookId, page);
      await reload();
    },
  };
}
