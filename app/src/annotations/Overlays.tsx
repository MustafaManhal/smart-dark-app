import { render } from "preact";
import type { BookAnnotations, Sticky } from "../db/annotations";
import type { Renderer } from "../reader/renderer";
import { COLOR_HEX } from "./colors";
import { rectToCss } from "./geometry";
import { StickyNote } from "./StickyNote";

type Handlers = {
  focusStickyId: string | null;
  onStickyChange: (s: Sticky) => void;
  onStickyDelete: (s: Sticky) => void;
};

function PageHighlights({ items }: { items: BookAnnotations["highlights"] }) {
  return (
    <>
      {items.flatMap((h) =>
        h.rects.map((r, i) => (
          <div key={`${h.id}-${i}`} class={`hl ${h.note ? "has-note" : ""}`} data-id={h.id}
            style={{ ...rectToCss(r), "--hl": COLOR_HEX[h.color] }} />
        )))}
    </>
  );
}

/** Draws highlights, sticky notes and bookmark ribbons into every page. */
export function renderOverlays(renderer: Renderer, data: BookAnnotations, handlers: Handlers) {
  const bookmarked = new Set(data.bookmarks.map((b) => b.page));
  for (let n = 1; n <= renderer.pageCount; n++) {
    const layers = renderer.layers(n);
    if (!layers) continue;
    layers.page.classList.toggle("is-bookmarked", bookmarked.has(n));
    render(<PageHighlights items={data.highlights.filter((h) => h.page === n)} />, layers.highlights);
    render(
      <>
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
