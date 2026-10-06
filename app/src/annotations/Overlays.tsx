import { t } from "../i18n/i18n";
import { render } from "preact";
import type { BookAnnotations, PassageNote, Sticky } from "../db/annotations";
import type { Renderer } from "../reader/renderer";
import { Icon } from "../ui/Icon";
import { COLOR_HEX } from "./colors";
import { rectToCss } from "./geometry";
import { StickyNote } from "./StickyNote";

type Handlers = {
  focusStickyId: string | null;
  onStickyChange: (s: Sticky) => void;
  onStickyDelete: (s: Sticky) => void;
  onNoteOpen: (n: PassageNote, anchor: DOMRect) => void;
};

function Marks({ data, page }: { data: BookAnnotations; page: number }) {
  return (
    <>
      {data.highlights.filter((h) => h.page === page).flatMap((h) =>
        h.rects.map((r, i) => (
          <div key={`${h.id}-${i}`} class="hl" data-id={h.id} style={{ ...rectToCss(r), "--hl": COLOR_HEX[h.color] }} />
        )))}
      {data.notes.filter((n) => n.page === page).flatMap((n) =>
        n.rects.map((r, i) => <div key={`${n.id}-${i}`} class="pn" data-id={n.id} style={rectToCss(r)} />))}
    </>
  );
}

function NoteBadge({ note, onOpen }: { note: PassageNote; onOpen: Handlers["onNoteOpen"] }) {
  const last = note.rects[note.rects.length - 1];
  if (!last) return null;
  return (
    <button type="button" class="pn-badge" aria-label={t("Open note: {text}", { text: (note.title || note.body).slice(0, 60) })}
      style={{ left: `${(last.x + last.w) * 100}%`, top: `${last.y * 100}%` }}
      onClick={(e) => onOpen(note, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
      <Icon name="note" size={14} />
    </button>
  );
}

/** Draws highlights, passage notes, sticky notes and bookmark ribbons into every page. */
export function renderOverlays(renderer: Renderer, data: BookAnnotations, handlers: Handlers) {
  const bookmarked = new Set(data.bookmarks.map((b) => b.page));
  for (let n = 1; n <= renderer.pageCount; n++) {
    const layers = renderer.layers(n);
    if (!layers) continue;
    layers.page.classList.toggle("is-bookmarked", bookmarked.has(n));
    render(<Marks data={data} page={n} />, layers.highlights);
    render(
      <>
        {data.notes.filter((x) => x.page === n).map((x) => <NoteBadge key={x.id} note={x} onOpen={handlers.onNoteOpen} />)}
        {data.stickies.filter((s) => s.page === n).map((s) => (
          <StickyNote key={s.id} note={s} autoFocus={s.id === handlers.focusStickyId}
            onChange={handlers.onStickyChange} onDelete={handlers.onStickyDelete} />
        ))}
      </>,
      layers.stickies,
    );
  }
}

export function clearOverlays(renderer: Renderer) {
  for (let n = 1; n <= renderer.pageCount; n++) {
    const layers = renderer.layers(n);
    if (!layers) continue;
    render(null, layers.highlights);
    render(null, layers.stickies);
  }
}
