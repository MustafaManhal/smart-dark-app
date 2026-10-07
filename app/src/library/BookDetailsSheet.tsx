import { useEffect, useState } from "preact/hooks";
import type { Book, Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { fetchCover, searchBooks, type BookMatch } from "../metadata/lookup";
import { saveSetting, settings } from "../settings";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { parseTags } from "./filters";

type Props = { repos: Repos; book: Book | null; knownTags?: string[]; onClose: () => void; onSaved: () => void };

/** Edit a book's title and author, optionally with details found online. */
export function BookDetailsSheet(props: Props) {
  // A fresh form per book, created with its values: nothing can overwrite typing later.
  return props.book ? <DetailsForm key={props.book.id} {...props} book={props.book} /> : null;
}

function DetailsForm({ repos, book, knownTags = [], onClose, onSaved }: Props & { book: Book }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [tags, setTags] = useState((book.tags ?? []).join(", "));
  const [query, setQuery] = useState(() => [book.title, book.author].filter(Boolean).join(" "));
  const [results, setResults] = useState<BookMatch[] | null>(null);
  const [cover, setCover] = useState<{ url: string; blob: Blob } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (cover) URL.revokeObjectURL(cover.url); }, [cover]);
  // Tags of other books that this one does not have yet: one tap adds them.
  const mine = parseTags(tags).map((tag) => tag.toLocaleLowerCase());
  const suggestions = knownTags.filter((tag) => !mine.includes(tag.toLocaleLowerCase())).slice(0, 12);

  async function search() {
    setBusy(true);
    setStatus(t("Searching…"));
    try {
      const found = await searchBooks(query);
      setResults(found);
      setStatus(found.length ? "" : t("No matches found."));
    } catch (error) {
      setStatus(t((error as Error).message));
    }
    setBusy(false);
  }

  async function pick(m: BookMatch) {
    setTitle(m.title);
    setAuthor(m.author);
    setResults(null);
    if (m.coverUrl) {
      const blob = await fetchCover(m.coverUrl);
      if (blob) setCover({ url: URL.createObjectURL(blob), blob });
    }
  }

  async function save() {
    await repos.books.update(book.id, { title: title.trim() || book.title, author: author.trim(), tags: parseTags(tags) });
    if (cover) await repos.books.setCover(book.id, cover.blob);
    onSaved();
    onClose();
  }

  return (
    <Sheet open title={t("Book details")} onClose={onClose}>
      <div class="details">
        {cover && <img class="details-cover" src={cover.url} alt="" />}
        <label class="field">
          <span>{t("Title")}</span>
          <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>{t("Author")}</span>
          <input value={author} onInput={(e) => setAuthor(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>{t("Tags, with commas between them")}</span>
          <input value={tags} dir="auto" autocapitalize="off" placeholder={t("physics, exam, to read")} onInput={(e) => setTags(e.currentTarget.value)} />
        </label>
        {suggestions.length > 0 && (
          <div class="tag-suggest" role="group" aria-label={t("Tags you already use")}>
            {suggestions.map((tag) => (
              <button type="button" class="chip" onClick={() => setTags(parseTags(`${tags}, ${tag}`).join(", "))}>{tag}</button>
            ))}
          </div>
        )}

        <div class="lookup">
          {settings.lookupOn.value ? (
            <form class="lookup-row" onSubmit={(e) => { e.preventDefault(); search(); }}>
              <input aria-label={t("Search online")} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
              <Button type="submit" disabled={busy || !query.trim()}><Icon name="search" size={18} /> {t("Find details")}</Button>
            </form>
          ) : (
            <div class="lookup-consent">
              <p class="muted small">{t("Find the title, author and cover online? Only the search text is sent to Open Library and Google Books.")}</p>
              <Button onClick={() => saveSetting("lookupOn", true)}>{t("Turn on online lookup")}</Button>
            </div>
          )}
          {status && <p class="muted small" role="status">{status}</p>}
          {results && results.length > 0 && (
            <ul class="matches" aria-label={t("Matches")}>
              {results.map((m) => (
                <li>
                  <button type="button" class="match" onClick={() => pick(m)}>
                    {m.coverUrl ? <img src={m.coverUrl} alt="" loading="lazy" referrerpolicy="no-referrer" /> : <span class="match-nocover"><Icon name="book" size={18} /></span>}
                    <span class="match-text">
                      <strong>{m.title}</strong>
                      <span>{[m.author, m.year].filter(Boolean).join(" · ")}</span>
                      <span class="match-source">{m.source}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div class="sheet-actions">
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" onClick={save}>{t("Save")}</Button>
        </div>
      </div>
    </Sheet>
  );
}
