import { useMemo, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { HIGHLIGHT_COLORS, type BookAnnotations, type HighlightColor } from "../db/annotations";
import { safeFileName, saveFile } from "../platform/saveFile";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { COLOR_HEX, COLOR_LABEL } from "./colors";
import { notesToMarkdown } from "./markdown";
import { counts, noteItems, type NoteItem, type NoteKind } from "./noteItems";

const TABS: [NoteKind, string][] = [["highlights", "Highlights"], ["notes", "Notes"], ["sticky", "Sticky notes"], ["bookmarks", "Bookmarks"]];

/** Highlights, notes, sticky notes and bookmarks of the open book: the Notes part of the side panel. */
export function NotesPanel({ title, data, onJump, onCopy, onRemove }: {
  title: string;
  data: BookAnnotations;
  onJump: (entry: NoteItem) => void;
  onCopy: (text: string) => void;
  onRemove: (entry: NoteItem) => void;
}) {
  const [kind, setKind] = useState<NoteKind>("highlights");
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [query, setQuery] = useState("");
  const n = counts(data);
  const items = useMemo(() => noteItems(data, { kind, color, query }), [data, kind, color, query]);
  const empty = n[kind] === 0;
  // Built before the tap so the iPhone share sheet still has the user's gesture.
  const exportFile = useMemo(
    () => new File([notesToMarkdown(title, data)], `${safeFileName(title)} notes.md`, { type: "text/markdown" }),
    [title, data],
  );
  const emptyText: Record<NoteKind, string> = {
    highlights: "Select text and pick a color, or use the highlighter in the toolbar.",
    notes: "Select text and choose Note to write about a passage.",
    sticky: "Use the sticky note tool, then tap anywhere on a page.",
    bookmarks: "Use the bookmark button to save the page you are on.",
  };

  return (
    <>
      <header class="panel-head">
        <h2>{t("Notes and highlights")}</h2>
        <IconButton label={t("Export notes")} icon="download" onClick={() => saveFile(exportFile)}
          disabled={!(n.highlights + n.notes + n.sticky + n.bookmarks)} />
      </header>
      <div class="panel-tabs" role="tablist" aria-label={t("Kind")}>
        {TABS.map(([k, label]) => (
          <button type="button" role="tab" aria-selected={kind === k} onClick={() => { setKind(k); setColor(null); }}>
            {t(label)} <span class="count">{n[k]}</span>
          </button>
        ))}
      </div>
      {!empty && kind !== "bookmarks" && (
        <div class="panel-filters">
          <label class="search">
            <Icon name="search" size={16} />
            <input type="search" placeholder={t("Search")} aria-label={t("Search notes")} value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
          {(kind === "highlights" || kind === "sticky") && (
            <div class="color-filter" role="radiogroup" aria-label={t("Color")}>
              {HIGHLIGHT_COLORS.map((c) => (
                <button type="button" role="radio" class="swatch" aria-checked={color === c} aria-label={t(`Only ${COLOR_LABEL[c].toLowerCase()}`)}
                  style={{ background: COLOR_HEX[c] }} onClick={() => setColor(color === c ? null : c)} />
              ))}
            </div>
          )}
        </div>
      )}
      <div class="panel-body">
        {empty && <p class="panel-empty">{t(emptyText[kind])}</p>}
        {!empty && !items.length && <p class="panel-empty">{t("Nothing matches.")}</p>}
        <ul class="note-list" aria-label={t(TABS.find(([k]) => k === kind)![1])}>
          {items.map((entry) => (
            <li key={entry.id} class="note-row">
              <button type="button" class={`note-card is-${entry.type}`} onClick={() => onJump(entry)}
                style={"color" in entry.item ? { "--c": COLOR_HEX[entry.item.color] } : undefined}>
                <span class="note-meta">{t("Page {page}", { page: entry.page })}</span>
                {entry.type === "highlight" && <blockquote dir="auto">{entry.item.text}</blockquote>}
                {entry.type === "note" && (
                  <>
                    {entry.item.title && <strong class="note-title" dir="auto">{entry.item.title}</strong>}
                    <blockquote class="is-plain" dir="auto">{entry.item.text}</blockquote>
                    <p class="note-text" dir="auto">{entry.item.body}</p>
                  </>
                )}
                {entry.type === "sticky" && entry.item.title && <strong class="note-title" dir="auto">{entry.item.title}</strong>}
                {entry.type === "sticky" && (entry.item.text || !entry.item.title) && (
                  <p class="note-text" dir="auto">{entry.item.text || t("Empty sticky note")}</p>
                )}
                {entry.type === "bookmark" && <p class="note-text">{t("Bookmarked page")}</p>}
              </button>
              {entry.type !== "bookmark" && (
                <IconButton label={t("Copy text")} icon="copy" class="note-copy"
                  onClick={() => onCopy([
                    "title" in entry.item ? entry.item.title : "", entry.item.text, entry.type === "note" ? entry.item.body : "",
                  ].filter(Boolean).join("\n\n"))} />
              )}
              <IconButton label={t(`Remove ${entry.type === "sticky" ? "sticky note" : entry.type} on page {page}`, { page: entry.page })} icon="trash"
                class="note-remove" onClick={() => onRemove(entry)} />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
