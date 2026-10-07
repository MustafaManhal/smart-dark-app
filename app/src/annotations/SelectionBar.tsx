import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { HIGHLIGHT_COLORS, type HighlightColor } from "../db/annotations";
import { t } from "../i18n/i18n";
import { Icon } from "../ui/Icon";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

type Anchor = { left: number; top: number; right: number; bottom: number };

/**
 * Where the bar goes for a selection at `anchor` (all in viewport pixels).
 * With a mouse it sits just above the selection. On touch screens the system
 * puts its own menu and the selection handles there, so the bar goes below.
 * When the preferred side has no room it takes the other one, and it never
 * leaves the area between `minTop` and `maxBottom`.
 */
export function placeSelectionBar(
  anchor: Anchor, size: { w: number; h: number },
  view: { width: number; minTop: number; maxBottom: number; touch: boolean },
) {
  const margin = 8;
  const above = anchor.top - size.h - (view.touch ? 64 : margin);
  const below = anchor.bottom + (view.touch ? 28 : margin);
  const fitsAbove = above >= view.minTop + margin;
  const fitsBelow = below + size.h <= view.maxBottom - margin;
  const preferred = view.touch ? (fitsBelow ? below : fitsAbove ? above : below) : (fitsAbove ? above : below);
  const top = Math.max(view.minTop + margin, Math.min(preferred, view.maxBottom - margin - size.h));
  const center = (anchor.left + anchor.right) / 2;
  const left = Math.max(margin, Math.min(center - size.w / 2, view.width - size.w - margin));
  return { left, top };
}

/** Shown next to the selected text: copy it, highlight it, or write a note on it. */
export function SelectionBar({ anchor, onHighlight, onNote, onCopy }: {
  anchor: Anchor;
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onCopy: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current!;
    // The bar stays below the reader's top bar (which slides away when hidden)
    // and above the read-aloud bar when that is open.
    const bar = document.querySelector(".reader-top")?.getBoundingClientRect().bottom ?? 0;
    // The lowest free line: above the read-aloud bar when it is open, else above the tool dock of a phone.
    const readBar = (document.querySelector(".read-bar") ?? document.querySelector(".dock"))?.getBoundingClientRect().top ?? innerHeight;
    setPos(placeSelectionBar(anchor, { w: el.offsetWidth, h: el.offsetHeight }, {
      width: innerWidth, minTop: Math.max(0, bar), maxBottom: Math.min(innerHeight, readBar), touch: matchMedia("(hover: none)").matches,
    }));
  }, [anchor.left, anchor.top, anchor.right, anchor.bottom]);

  // preventDefault on pointerdown keeps the text selection alive while tapping.
  const keep = (e: Event) => e.preventDefault();
  return (
    <div ref={box} class="selection-bar" role="toolbar" aria-label={t("Selected text")} onPointerDown={keep} onMouseDown={keep}
      style={pos ? { left: `${pos.left}px`, top: `${pos.top}px` } : { left: "0px", top: "0px", visibility: "hidden" }}>
      <button type="button" class="sel-action" onClick={onCopy}><Icon name="copy" size={18} /> {t("Copy")}</button>
      <span class="sep" />
      {HIGHLIGHT_COLORS.map((c) => (
        <button type="button" class="swatch" aria-label={t(`Highlight ${COLOR_LABEL[c].toLowerCase()}`)}
          style={{ background: COLOR_HEX[c] }} onClick={() => onHighlight(c)} />
      ))}
      <span class="sep" />
      <button type="button" class="sel-action" onClick={onNote}><Icon name="note" size={18} /> {t("Note")}</button>
    </div>
  );
}
