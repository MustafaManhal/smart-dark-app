import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import type { Book, Progress, Repos } from "../db/repos";
import { navigate } from "../router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { BackupSheet } from "../backup/BackupSheet";
import { BookDetailsSheet } from "./BookDetailsSheet";
import { dueReminder } from "../stats/reminders";
import { isIosBrowser } from "../platform/pwa";
import { makeCover } from "./cover";
import { allTags, continueReading, filterBooks, percentRead, type Shelf, type SortKey } from "./filters";
import { saveSetting, settings } from "../settings";
import type { BookAnnotations } from "../db/annotations";
import { searchInsideBooks, searchNotes, type BookHits } from "./deepSearch";
import { importPdf, ImportError } from "./importer";
import { PasswordSheet } from "./PasswordSheet";
import { loadSample } from "./sample";
import { Brand } from "../ui/Brand";
import "./library.css";

const SHELVES: [Shelf, string][] = [["all", "All"], ["reading", "Reading"], ["unread", "Not started"], ["finished", "Finished"], ["favorites", "Favorites"]];
const SORTS: [SortKey, string][] = [["recent", "Recent"], ["title", "Title"], ["progress", "Progress"]];

export function LibraryScreen({ repos }: { repos: Repos }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState(new Map<string, Progress>());
  const [covers, setCovers] = useState(new Map<string, string>());
  const [shelf, setShelf] = useState<Shelf>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [installHint, setInstallHint] = useState(() => {
    try {
      return isIosBrowser() && localStorage.getItem("installHintDismissed") !== "1";
    } catch {
      return isIosBrowser();
    }
  });
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
    dueReminder(repos).then(setReminder);
  }, []);

  const [locked, setLocked] = useState<{ name: string; wrong: boolean; answer: (password: string | null) => void } | null>(null);

  async function importFiles(files: FileList | File[]) {
    setBusy(true);
    setMessage("");
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      // A protected PDF: ask for its password, again if it was wrong, until it opens or the reader gives up.
      let password: string | undefined;
      for (;;) {
        try {
          const { book, duplicate } = await importPdf(file, { books: repos.books, makeCover }, password);
          if (duplicate) notes.push(t("“{title}” is already in your library.", { title: book.title }));
        } catch (error) {
          if (error instanceof ImportError && (error.code === "password" || error.code === "wrong-password")) {
            const answer = await new Promise<string | null>((resolve) =>
              setLocked({ name: file.name, wrong: error.code === "wrong-password", answer: resolve }));
            setLocked(null);
            if (answer !== null) {
              password = answer;
              continue;
            }
            notes.push(t("{name} was not added: it needs its password.", { name: file.name }));
          } else {
            if (!(error instanceof ImportError)) console.error("Import failed", error);
            notes.push(error instanceof ImportError
              ? t(error.code === "not-pdf" ? "{name} is not a PDF." : "{name} could not be opened.", { name: file.name })
              : t("{name} could not be imported.", { name: file.name }));
          }
        }
        break;
      }
    }
    setBusy(false);
    setMessage(notes.join(" "));
    reload();
  }

  const visible = useMemo(
    () => (books ? filterBooks(books, progress, { shelf, query, sort, tag }) : []),
    [books, progress, shelf, query, sort, tag],
  );
  const tags = useMemo(() => allTags(books ?? []), [books]);
  // A tag that no book has any more cannot stay chosen.
  useEffect(() => {
    if (tag && !tags.includes(tag)) setTag(null);
  }, [tags, tag]);
  // "Continue reading" is for the plain library: a search or a shelf already says what to show.
  const resume = useMemo(
    () => (books && books.length > 1 && shelf === "all" && !query.trim() && !tag ? continueReading(books, progress) : []),
    [books, progress, shelf, query, tag],
  );
  const view = settings.libraryView.value;

  // A search also looks in everything the reader wrote or marked, and on request inside the text of the books.
  const searching = query.trim().length >= 2;
  const [marks, setMarks] = useState<BookAnnotations | null>(null);
  useEffect(() => {
    if (searching && !marks) repos.annotations.all().then(setMarks);
  }, [searching, marks]);
  const noteHits = useMemo(() => (searching && marks ? searchNotes(marks, query) : []), [searching, marks, query]);
  const [inside, setInside] = useState<{ found: BookHits[]; done: number; now: Book | null; running: boolean } | null>(null);
  const insideStop = useRef({ now: false });
  // Another query: what was found inside the books is about other words.
  useEffect(() => {
    insideStop.current.now = true;
    setInside(null);
  }, [query]);
  useEffect(() => () => { insideStop.current.now = true; }, []);
  async function searchInside() {
    if (!books) return;
    const stop = (insideStop.current = { now: false });
    setInside({ found: [], done: 0, now: books[0] ?? null, running: true });
    const found = await searchInsideBooks(repos, books, query, (list, done, now) => !stop.now && setInside({ found: list, done, now, running: true }), stop);
    if (!stop.now) setInside({ found, done: books.length, now: null, running: false });
  }
  const titleOf = (bookId: string) => books?.find((b) => b.id === bookId)?.title ?? "";
  const KIND = { highlight: "Highlight", note: "Note", sticky: "Sticky note" } as const;
  async function toggleFavorite(book: Book) {
    await repos.books.update(book.id, { favorite: !book.favorite });
    setBooks((list) => list && list.map((b) => (b.id === book.id ? { ...b, favorite: !book.favorite } : b)));
  }
  const pick = () => fileInput.current?.click();
  // The sample book opens with a three-step tour of the reader.
  async function trySample() {
    setBusy(true);
    setMessage("");
    try {
      const { book } = await importPdf(await loadSample(), { books: repos.books, makeCover });
      navigate({ name: "reader", bookId: book.id, tour: true });
    } catch {
      setMessage(t("The sample book could not be loaded."));
      setBusy(false);
    }
  }

  return (
    <div
      class={`library ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files); }}
    >
      <header class="lib-head">
        <div class="lib-title">
          <Brand />
          <h1>{t("Your library")}</h1>
        </div>
        <IconButton label={t("Notebook")} icon="notes" onClick={() => navigate({ name: "notebook" })} />
        <IconButton label={t("Reading stats")} icon="chart" onClick={() => navigate({ name: "stats" })} />
        <IconButton label={t("Settings")} icon="settings" onClick={() => navigate({ name: "settings" })} />
        <IconButton label={t("Back up and restore")} icon="backup" class="lib-backup" onClick={() => setBackupOpen(true)} />
        <Button variant="primary" onClick={pick} disabled={busy}>
          <Icon name="plus" size={18} /> {t(busy ? "Importing" : "Add PDF")}
        </Button>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={(e) => { const f = e.currentTarget.files; if (f?.length) importFiles(f); e.currentTarget.value = ""; }} />
      </header>

      {books && books.length > 0 && (
        <div class="lib-tools">
          <label class="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder={t("Search books, tags and notes")} value={query}
              onInput={(e) => setQuery(e.currentTarget.value)} aria-label={t("Search books, tags and notes")} />
          </label>
          <div class="chips" role="tablist" aria-label={t("Shelves")}>
            {SHELVES.map(([key, label]) => (
              <button type="button" role="tab" aria-selected={shelf === key} class="chip" onClick={() => setShelf(key)}>{t(label)}</button>
            ))}
          </div>
          <label class="sort">
            {t("Sort")}
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
              {SORTS.map(([key, label]) => <option value={key}>{t(label)}</option>)}
            </select>
          </label>
          <IconButton label={t(view === "grid" ? "Show as a list" : "Show as covers")} icon={view === "grid" ? "rows" : "grid"} class="lib-view"
            onClick={() => saveSetting("libraryView", view === "grid" ? "list" : "grid")} />
          {tags.length > 0 && (
            <div class="chips lib-tags" role="group" aria-label={t("Tags")}>
              {tags.map((name) => (
                <button type="button" class="chip tag" aria-pressed={tag === name} onClick={() => setTag(tag === name ? null : name)}>{name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {resume.length > 0 && (
        <section class="lib-continue" aria-label={t("Continue reading")}>
          <h2>{t("Continue reading")}</h2>
          <ul>
            {resume.map((book) => {
              const at = progress.get(book.id)!;
              const pct = percentRead(book, at);
              const cover = covers.get(book.id);
              return (
                <li key={book.id}>
                  <button type="button" class="resume" onClick={() => navigate({ name: "reader", bookId: book.id })}>
                    <span class="resume-cover">{cover ? <img src={cover} alt="" /> : <Icon name="book" size={24} />}</span>
                    <span class="resume-text">
                      <strong>{book.title}</strong>
                      {book.author && <span class="resume-author">{book.author}</span>}
                      <span class="resume-at">{t("Page {page} of {total}", { page: at.page, total: book.pageCount })}<b dir="ltr">{pct}%</b></span>
                      <span class="bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span class="resume-go">{t("Continue")}<Icon name="chevronRight" size={16} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {installHint && (
        <div class="lib-install" role="note" aria-label={t("Install the app")}>
          <Icon name="share" size={22} />
          <p>{t("Install Reader343 on your iPhone: tap Share, then Add to Home Screen. It opens full screen and works offline.")}</p>
          <IconButton label={t("Dismiss")} icon="close" onClick={() => {
            setInstallHint(false);
            try { localStorage.setItem("installHintDismissed", "1"); } catch {}
          }} />
        </div>
      )}
      {reminder && (
        <div class="lib-reminder" role="status">
          <span>{t("Time to read:")} {reminder}</span>
          <IconButton label={t("Dismiss reminder")} icon="close" onClick={() => setReminder(null)} />
        </div>
      )}
      {message && <p class="lib-message" role="status">{message}</p>}

      {books && books.length === 0 && (
        <section class="lib-empty" aria-label={t("Welcome")}>
          <img class="lib-empty-mark" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width="84" height="84" />
          <h2>{t("Welcome to Reader343")}</h2>
          <p>{t("A calm place to read PDFs. Your books and notes stay on this device.")}</p>
          <ul class="welcome-points">
            <li><Icon name="palette" size={20} /><span>{t("Dark pages that keep photos and colors as they are")}</span></li>
            <li><Icon name="highlighter" size={20} /><span>{t("Highlights, notes and sticky notes, all in one list")}</span></li>
            <li><Icon name="headphones" size={20} /><span>{t("Read aloud, with natural voices on a computer")}</span></li>
          </ul>
          <div class="welcome-actions">
            <Button variant="primary" onClick={pick} disabled={busy}>{t("Choose a PDF")}</Button>
            <Button onClick={trySample} disabled={busy}>{t("Try the sample book")}</Button>
          </div>
          <p class="welcome-drop">{t("Or drop a PDF anywhere on this page.")}</p>
        </section>
      )}

      {books && books.length > 0 && visible.length === 0 && (
        <p class="lib-none">{t(searching ? "No title, author or tag matches." : "No books match.")}</p>
      )}

      <ul class={view === "list" ? "grid is-list" : "grid"} aria-label={t("Books")}>
        {visible.map((book) => {
          const pct = percentRead(book, progress.get(book.id));
          const cover = covers.get(book.id);
          return (
            <li class="card" key={book.id}>
              <button type="button" class="card-open" onClick={() => navigate({ name: "reader", bookId: book.id })}>
                <div class="cover">
                  {cover ? <img src={cover} alt="" loading="lazy" /> : <Icon name="book" size={32} />}
                </div>
                <span class="bar" role="progressbar" aria-label={t("{n}% read", { n: pct })} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <span style={{ width: `${pct}%` }} />
                </span>
                <span class="card-title">{book.title}</span>
                {book.author && <span class="card-author">{book.author}</span>}
                {!!book.tags?.length && <span class="card-tags">{book.tags.join(" · ")}</span>}
              </button>
              <div class={`card-actions ${book.favorite ? "has-star" : ""}`}>
                <IconButton label={t(book.favorite ? "Remove {title} from favorites" : "Add {title} to favorites", { title: book.title })}
                  icon="star" class={book.favorite ? "card-star is-on" : "card-star"} aria-pressed={!!book.favorite} onClick={() => toggleFavorite(book)} />
                <IconButton label={t("Edit details of {title}", { title: book.title })} icon="edit" onClick={() => setEditing(book)} />
                <IconButton label={t("Remove {title}", { title: book.title })} icon="trash" onClick={() => setToDelete(book)} />
              </div>
            </li>
          );
        })}
      </ul>

      {searching && books && books.length > 0 && (
        <>
          {noteHits.length > 0 && (
            <section class="lib-found" aria-label={t("In your notes and highlights")}>
              <h2>{t("In your notes and highlights")}</h2>
              <ul>
                {noteHits.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" class="lib-hit" onClick={() => navigate({ name: "reader", bookId: hit.bookId, page: hit.page })}>
                      <span class="lib-hit-where"><strong>{titleOf(hit.bookId)}</strong> · {t("Page {page}", { page: hit.page })} · {t(KIND[hit.kind])}</span>
                      <span class="lib-hit-text" dir="auto">{hit.before}<mark>{hit.hit}</mark>{hit.after}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section class="lib-found" aria-label={t("Inside the books")}>
            <h2>{t("Inside the books")}</h2>
            {!inside && (
              <Button onClick={searchInside}><Icon name="search" size={18} /> {t("Search the text of every book")}</Button>
            )}
            {inside?.running && (
              <p class="lib-hit-status" role="status">
                <span>{t("Searching book {n} of {total}: {title}", { n: Math.min(books.length, inside.done + 1), total: books.length, title: inside.now?.title ?? "" })}</span>
                <Button onClick={() => { insideStop.current.now = true; setInside({ ...inside, running: false, now: null }); }}>{t("Stop")}</Button>
              </p>
            )}
            {inside && !inside.running && inside.found.length === 0 && <p class="lib-hit-status" role="status">{t("Not found inside any book.")}</p>}
            {inside && inside.found.length > 0 && (
              <ul>
                {inside.found.map(({ book, count, first }) => (
                  <li key={book.id}>
                    <div class="lib-hit-book"><strong>{book.title}</strong><span>{t(count === 1 ? "1 match" : "{n} matches", { n: count })}</span></div>
                    {first.map((m) => (
                      <button type="button" class="lib-hit" onClick={() => navigate({ name: "reader", bookId: book.id, page: m.page, find: query.trim() })}>
                        <span class="lib-hit-where">{t("Page {page}", { page: m.page })}</span>
                        <span class="lib-hit-text" dir="auto">{m.before}<mark>{m.hit}</mark>{m.after}</span>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <BookDetailsSheet repos={repos} book={editing} knownTags={tags} onClose={() => setEditing(null)} onSaved={reload} />
      <BackupSheet repos={repos} open={backupOpen} onClose={() => setBackupOpen(false)} onRestored={reload} />
      <PasswordSheet locked={locked} />

      <Sheet open={!!toDelete} title={t("Remove book")} onClose={() => setToDelete(null)}>
        <p>{t("Remove “{title}” and its reading progress from this device?", { title: toDelete?.title ?? "" })}</p>
        <div class="sheet-actions">
          <Button onClick={() => setToDelete(null)}>{t("Cancel")}</Button>
          <Button variant="danger" onClick={async () => { await repos.books.remove(toDelete!.id); setToDelete(null); reload(); }}>{t("Remove")}</Button>
        </div>
      </Sheet>
    </div>
  );
}
