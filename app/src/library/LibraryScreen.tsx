import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Book, Progress, Repos } from "../db/repos";
import { navigate } from "../router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { makeCover } from "./cover";
import { filterBooks, percentRead, type Shelf, type SortKey } from "./filters";
import { importPdf, ImportError } from "./importer";
import "./library.css";

const SHELVES: [Shelf, string][] = [["all", "All"], ["reading", "Reading"], ["unread", "Not started"], ["finished", "Finished"]];
const SORTS: [SortKey, string][] = [["recent", "Recent"], ["title", "Title"], ["progress", "Progress"]];

export function LibraryScreen({ repos }: { repos: Repos }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState(new Map<string, Progress>());
  const [covers, setCovers] = useState(new Map<string, string>());
  const [shelf, setShelf] = useState<Shelf>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    const [all, prog] = await Promise.all([repos.books.all(), repos.progress.all()]);
    const urls = new Map<string, string>();
    for (const b of all) {
      const blob = await repos.books.cover(b.id);
      if (blob) urls.set(b.id, URL.createObjectURL(blob));
    }
    setProgress(new Map(prog.map((p) => [p.bookId, p])));
    setBooks(all);
    setCovers((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return urls;
    });
  }

  useEffect(() => {
    reload();
  }, []);

  async function importFiles(files: FileList | File[]) {
    setBusy(true);
    setMessage("");
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const { book, duplicate } = await importPdf(file, { books: repos.books, makeCover });
        if (duplicate) notes.push(`“${book.title}” is already in your library.`);
      } catch (error) {
        if (!(error instanceof ImportError)) console.error("Import failed", error);
        notes.push(error instanceof ImportError ? error.message : `${file.name} could not be imported.`);
      }
    }
    setBusy(false);
    setMessage(notes.join(" "));
    reload();
  }

  const visible = useMemo(
    () => (books ? filterBooks(books, progress, { shelf, query, sort }) : []),
    [books, progress, shelf, query, sort],
  );
  const pick = () => fileInput.current?.click();

  return (
    <div
      class={`library ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files); }}
    >
      <header class="lib-head">
        <h1>Your library</h1>
        <Button variant="primary" onClick={pick} disabled={busy}>
          <Icon name="plus" size={18} /> {busy ? "Importing" : "Add PDF"}
        </Button>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={(e) => { const f = e.currentTarget.files; if (f?.length) importFiles(f); e.currentTarget.value = ""; }} />
      </header>

      {books && books.length > 0 && (
        <div class="lib-tools">
          <label class="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Search title or author" value={query}
              onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search title or author" />
          </label>
          <div class="chips" role="tablist" aria-label="Shelves">
            {SHELVES.map(([key, label]) => (
              <button type="button" role="tab" aria-selected={shelf === key} class="chip" onClick={() => setShelf(key)}>{label}</button>
            ))}
          </div>
          <label class="sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
              {SORTS.map(([key, label]) => <option value={key}>{label}</option>)}
            </select>
          </label>
        </div>
      )}

      {message && <p class="lib-message" role="status">{message}</p>}

      {books && books.length === 0 && (
        <section class="lib-empty">
          <div class="lib-empty-art"><Icon name="book" size={40} /></div>
          <h2>Add your first book</h2>
          <p>Choose a PDF or drop it here. It stays on this device.</p>
          <Button variant="primary" onClick={pick}>Choose a PDF</Button>
        </section>
      )}

      {books && books.length > 0 && visible.length === 0 && (
        <p class="lib-none">No books match.</p>
      )}

      <ul class="grid" aria-label="Books">
        {visible.map((book) => {
          const pct = percentRead(book, progress.get(book.id));
          const cover = covers.get(book.id);
          return (
            <li class="card" key={book.id}>
              <button type="button" class="card-open" onClick={() => navigate({ name: "reader", bookId: book.id })}>
                <div class="cover">
                  {cover ? <img src={cover} alt="" loading="lazy" /> : <Icon name="book" size={32} />}
                </div>
                <span class="card-title">{book.title}</span>
                {book.author && <span class="card-author">{book.author}</span>}
                <span class="bar" role="progressbar" aria-label={`${pct}% read`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${pct}%` }} />
                </span>
              </button>
              <IconButton label={`Remove ${book.title}`} icon="trash" class="card-remove" onClick={() => setToDelete(book)} />
            </li>
          );
        })}
      </ul>

      <Sheet open={!!toDelete} title="Remove book" onClose={() => setToDelete(null)}>
        <p>Remove “{toDelete?.title}” and its reading progress from this device?</p>
        <div class="sheet-actions">
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={async () => { await repos.books.remove(toDelete!.id); setToDelete(null); reload(); }}>Remove</Button>
        </div>
      </Sheet>
    </div>
  );
}
