import { HIGHLIGHT_COLORS, type HighlightColor } from "../db/annotations";
import { t } from "../i18n/i18n";
import { Icon } from "../ui/Icon";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

/** Shown while text is selected. Fixed above the bottom bar so it never covers the iOS menu. */
export function SelectionBar({ onHighlight, onNote, onCopy }: {
  onHighlight: (color: HighlightColor) => void;
  onNote: () => void;
  onCopy: () => void;
}) {
  // preventDefault on pointerdown keeps the text selection alive while tapping.
  const keep = (e: Event) => e.preventDefault();
  return (
    <div class="selection-bar" role="toolbar" aria-label={t("Selected text")} onPointerDown={keep} onMouseDown={keep}>
      {HIGHLIGHT_COLORS.map((c) => (
        <button type="button" class="swatch" aria-label={t(`Highlight ${COLOR_LABEL[c].toLowerCase()}`)}
          style={{ background: COLOR_HEX[c] }} onClick={() => onHighlight(c)} />
      ))}
      <span class="sep" />
      <button type="button" class="sel-action" onClick={onNote}><Icon name="note" size={18} /> {t("Note")}</button>
      <button type="button" class="sel-action" onClick={onCopy}><Icon name="copy" size={18} /> {t("Copy")}</button>
    </div>
  );
}
