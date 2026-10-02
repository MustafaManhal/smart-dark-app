# Plan 2: Annotations

**Goal:** bookmarks, multi-color highlights, notes on passages, sticky notes placed and dragged on the page,
a notes review screen, and full backup/restore.

**Research (2026-10-03):**
- iOS shows its own selection menu and it cannot be suppressed (still true on iOS 26.1). Our selection
  toolbar sits in a fixed bar at the bottom on touch screens so the two never overlap.
- Use a debounced `selectionchange`, not mouseup/touchend (iOS fires it while handles move).
- Add `-webkit-text-size-adjust: none` to text layer spans (pdf.js #14243, iOS text inflation).
- Saving a file from an iOS home-screen app: `<a download>` is silently ignored; `navigator.share({ files })`
  works ("Save to Files"). It needs a fresh tap, so the backup zip is built first and a second "Save" tap
  shares it. Fall back to an anchor download elsewhere. Cancel (`AbortError`) is not an error.
- Zip: fflate 0.8.3 (MIT).

**Data model (DB v2):**
- `highlights` { id, bookId, page, rects: NormRect[], color, text, note, createdAt, updatedAt } index bookId
- `stickies` { id, bookId, page, x, y, color, text, collapsed, createdAt, updatedAt } index bookId
- `bookmarks` { id, bookId, page, createdAt } index bookId
- `NormRect` = { x, y, w, h } as fractions of the page box, so they survive zoom, DPR and rotation of layout.
- Removing a book deletes its annotations.

## Tasks

1. **DB v2 + AnnotationsRepo** — `app/src/db/schema.ts` (v2 step), `app/src/db/annotations.ts`.
   API: `listForBook(bookId)`, `putHighlight/putSticky/putBookmark`, `remove(kind, id)`, `toggleBookmark(bookId, page)`.
   Tests: upgrade from a v1 database keeps books; CRUD; book removal cascades.
2. **Selection geometry** — `app/src/annotations/geometry.ts`: `normalizeRects(clientRects, pageBox)` merges
   rects on the same line and clips to the page; `toCss(rect)`. Unit tests with plain rect objects.
3. **Annotation layer** — `app/src/annotations/layer.tsx`: renders highlights, bookmark ribbon and sticky notes
   into each page div (Preact render into a per-page container). Renderer gains `onPageReady(number, div)`
   and `pageDiv(number)`. Highlights use multiply blending on light pages and translucent fills on dark pages.
4. **Selection toolbar + highlight sheet** — colors (yellow, green, blue, pink, purple), Note, Copy.
   Tapping a highlight opens a sheet to recolor, write a note, copy or delete.
5. **Sticky notes** — "Add sticky note" tool: tap the page to place; drag by the header (pointer events,
   `touch-action: none` on the header only); edit inline; color; collapse to a small tab; delete.
6. **Bookmarks** — top-bar toggle for the current page; ribbon on bookmarked pages.
7. **Notes screen** — `#/notes/<bookId>`: bookmarks, highlights (with notes) and sticky notes; filters by type
   and color; search; tap to open the reader at that page (`#/read/<id>?p=<page>`).
8. **Backup and restore** — `app/src/backup/backup.ts`: zip with `backup.json` (books, progress,
   annotations, settings) plus `files/<id>.pdf` and `covers/<id>.jpg`. Restore matches books by hash, adds
   missing books, and adds annotations whose ids are new. Library menu: "Back up library", "Restore from
   backup". Unit test: export then import into an empty DB gives identical data.

Every task: unit tests (Vitest) and e2e (Playwright Chromium desktop + WebKit iPhone), responsive sweep
still green, commit.
