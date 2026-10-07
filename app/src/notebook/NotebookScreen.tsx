import { useEffect, useMemo, useState } from "preact/hooks";
import { COLOR_HEX } from "../annotations/colors";
import type { BookAnnotations } from "../db/annotations";
import type { Book, Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { allTags } from "../library/filters";
import { safeFileName, saveFile } from "../platform/saveFile";
import { navigate } from "../router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { byBook, filterNotebook, notebookAnki, notebookCsv, notebookItems, notebookMarkdown, type NotebookFilter, type NotebookKind } from "./items";
import "../annotations/notes.css";
import "../library/library.css";
import "./notebook.css";

const KINDS: [NotebookKind | "all", string][] = [["all", "All"], ["highlight", "Highlights"], ["note", "Notes"], ["sticky", "Sticky notes"]];
const KIND_LABEL: Record<NotebookKind, string> = { highlight: "Highlight", note: "Note", sticky: "Sticky note" };
const FORMATS: [string, string, string, string, (items: ReturnType<typeof filterNotebook>) => string][] = [
  ["md", "Markdown", "A text file with a heading for each book. Opens in any notes app.", "text/markdown", notebookMarkdown],
  ["csv", "Spreadsheet (CSV)", "One row for each mark, for Excel, Numbers or Sheets.", "text/csv", notebookCsv],
  ["txt", "Anki cards", "A file Anki imports: the passage on the front, your note and the book on the back.", "text/plain", notebookAnki],
];

/** Everything marked and written in every book, in one place. */
export function NotebookScreen({ repos }: { repos: Repos }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [marks, setMarks] = useState<BookAnnotations | null>(null);
  const [filter, setFilter] = useState<NotebookFilter>({ kind: "all", bookId: null, tag: null, query: "", sort: "book" });
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    Promise.all([repos.books.all(), repos.annotations.all()]).then(([b, m]) => {
      setBooks(b);
      setMarks(m);
    });
  }, []);

  const items = useMemo(() => (books && marks ? notebookItems(marks, books) : []), [books, marks]);
  const shown = useMemo(() => filterNotebook(items, filter), [items, filter]);
  const groups = useMemo(() => (filter.sort === "book" ? byBook(shown) : [{ bookId: "", title: "", author: "", items: shown }]), [shown, filter.sort]);
  const tags = useMemo(() => allTags(books ?? []), [books]);
  const withMarks = useMemo(() => (books ?? []).filter((b) => items.some((i) => i.bookId === b.id)), [books, items]);
  const set = (patch: Partial<NotebookFilter>) => setFilter((f) => ({ ...f, ...patch }));
  // The files are made before the tap that saves them (a phone only saves from inside a tap).
  const files = useMemo(() => (exporting
    ? FORMATS.map(([ext, , , type, make]) => new File([make(shown)], `${safeFileName(t("Notebook"))}.${ext}`, { type }))
    : []), [exporting, shown]);

  return (
    <div class="notebook">
      <header class="notebook-head">
        <IconButton label={t("Back to library")} icon="back" onClick={() => navigate({ name: "library" })} />
        <h1>{t("Notebook")}</h1>
        <Button onClick={() => navigate({ name: "review" })} disabled={!items.length}>{t("Review")}</Button>
        <Button onClick={() => setExporting(true)} disabled={!shown.length}><Icon name="download" size={18} /> {t("Export")}</Button>
      </header>

      {books && marks && items.length === 0 && (
        <section class="lib-empty">
          <div class="lib-empty-art"><Icon name="notes" size={40} /></div>
          <h2>{t("Nothing marked yet")}</h2>
          <p>{t("Highlights, notes and sticky notes from all your books are collected here.")}</p>
        </section>
      )}

      {items.length > 0 && (
        <>
          <div class="lib-tools">
            <label class="search">
              <Icon name="search" size={18} />
              <input type="search" placeholder={t("Search your notes")} aria-label={t("Search your notes")} value={filter.query}
                onInput={(e) => set({ query: e.currentTarget.value })} />
            </label>
            <div class="chips" role="tablist" aria-label={t("Kind")}>
              {KINDS.map(([key, label]) => (
                <button type="button" role="tab" class="chip" aria-selected={filter.kind === key} onClick={() => set({ kind: key })}>{t(label)}</button>
              ))}
            </div>
            <label class="sort">
              {t("Book")}
              <select value={filter.bookId ?? ""} onChange={(e) => set({ bookId: e.currentTarget.value || null })}>
                <option value="">{t("All books")}</option>
                {withMarks.map((b) => <option value={b.id}>{b.title}</option>)}
              </select>
            </label>
            <label class="sort">
              {t("Sort")}
              <select value={filter.sort} onChange={(e) => set({ sort: e.currentTarget.value as NotebookFilter["sort"] })}>
                <option value="book">{t("By book")}</option>
                <option value="newest">{t("Newest first")}</option>
              </select>
            </label>
            {tags.length > 0 && (
              <div class="chips lib-tags" role="group" aria-label={t("Tags")}>
                {tags.map((name) => (
                  <button type="button" class="chip tag" aria-pressed={filter.tag === name} onClick={() => set({ tag: filter.tag === name ? null : name })}>{name}</button>
                ))}
              </div>
            )}
          </div>

          <p class="notebook-count" role="status">{t(shown.length === 1 ? "1 entry" : "{n} entries", { n: shown.length })}</p>
          {shown.length === 0 && <p class="lib-none">{t("Nothing matches.")}</p>}

          {groups.map((group) => (
            <section class="notebook-book" key={group.bookId} aria-label={group.title || t("Notebook")}>
              {group.title && <h2>{group.title}{group.author && <span> · {group.author}</span>}</h2>}
              <ul class="note-list">
                {group.items.map((item) => (
                  <li key={item.id} class="note-row">
                    <button type="button" class={`note-card is-${item.kind}`} style={item.color ? { "--c": COLOR_HEX[item.color] } : undefined}
                      onClick={() => navigate({ name: "reader", bookId: item.bookId, page: item.page })}>
                      <span class="note-meta">
                        {!group.title && <b>{item.bookTitle}</b>}{!group.title && " · "}{t("Page {page}", { page: item.page })} · {t(KIND_LABEL[item.kind])}
                      </span>
                      {item.title && <strong class="note-title" dir="auto">{item.title}</strong>}
                      {item.kind === "highlight" && <blockquote dir="auto">{item.passage || t("Marked area")}</blockquote>}
                      {item.kind === "note" && <blockquote class="is-plain" dir="auto">{item.passage}</blockquote>}
                      {item.note && <p class="note-text" dir="auto">{item.note}</p>}
                      {item.kind === "sticky" && !item.note && !item.title && <p class="note-text">{t("Empty sticky note")}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <Sheet open={exporting} title={t("Export")} onClose={() => setExporting(false)}>
        <p class="notebook-export-note">{t(shown.length === 1 ? "1 entry, as it is filtered now." : "{n} entries, as they are filtered now.", { n: shown.length })}</p>
        <ul class="book-menu">
          {FORMATS.map(([ext, name, about], i) => (
            <li>
              <button type="button" onClick={async () => { if (files[i] && await saveFile(files[i])) setExporting(false); }}>
                <Icon name="download" />
                <span><strong>{t(name)}</strong><small>{t(about)}</small></span>
                <kbd dir="ltr">.{ext}</kbd>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/** For the translation test: these reach t() through variables. */
export const NOTEBOOK_STRINGS = [...KINDS.map(([, l]) => l), ...Object.values(KIND_LABEL), ...FORMATS.flatMap(([, name, about]) => [name, about])];
