import { t } from "../i18n/i18n";
import { render } from "preact";
import type { BookAnnotations, PassageNote, Sticky } from "../db/annotations";
import type { Renderer } from "../reader/renderer";
import { Icon } from "../ui/Icon";
import { COLOR_HEX } from "./colors";
import { fromViewPoint, rectToCss, toViewPoint, toViewRect, type Turn } from "./geometry";
import { StickyNote } from "./StickyNote";

type Handlers = {
  focusStickyId: string | null;
  /** Bumped by undo and redo. */
  epoch: number;
  onStickyChange: (s: Sticky) => void;
  onStickyDelete: (s: Sticky) => void;
  onNoteOpen: (n: PassageNote, anchor: DOMRect) => void;
};

function Marks({ data, page }: { data: BookAnnotations; page: number }) {
  return (
    <>
      {data.highlights.filter((h) => h.page === page).flatMap((h) =>
        h.rects.map((r, i) => (
          <div key={`${h.id}-${i}`} class={h.style && h.style !== "highlight" ? `hl is-${h.style}` : "hl"} data-id={h.id}
            style={{ ...rectToCss(r), "--hl": COLOR_HEX[h.color] }} />
        )))}
      {data.notes.filter((n) => n.page === page).flatMap((n) =>
        n.rects.map((r, i) => <div key={`${n.id}-${i}`} class="pn" data-id={n.id} style={rectToCss(r)} />))}
    </>
  );
}

function NoteBadge({ note, turn, onOpen }: { note: PassageNote; turn: Turn; onOpen: Handlers["onNoteOpen"] }) {
  // The badge is upright on a turned page, at the end of the passage as it is shown.
  const end = note.rects[note.rects.length - 1];
  if (!end) return null;
  const last = toViewRect(end, turn);
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
    const turn = renderer.turnValue;
    render(<Marks data={data} page={n} />, layers.highlights);
    render(
      <>
        {data.notes.filter((x) => x.page === n).map((x) => <NoteBadge key={x.id} note={x} turn={turn} onOpen={handlers.onNoteOpen} />)}
        {data.stickies.filter((s) => s.page === n).map((s) => {
          // A sticky note stays upright: it is handed its place on the page as shown, and gives it back the same way.
          const [x, y] = toViewPoint(s.x, s.y, turn);
          const back = (moved: Sticky) => {
            const [bx, by] = fromViewPoint(moved.x, moved.y, turn);
            return { ...moved, x: bx, y: by };
          };
          return (
            <StickyNote key={`${s.id}-${turn}`} note={{ ...s, x, y }} epoch={handlers.epoch} autoFocus={s.id === handlers.focusStickyId}
              onChange={(moved) => handlers.onStickyChange(back(moved))} onDelete={(gone) => handlers.onStickyDelete(back(gone))} />
          );
        })}
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
