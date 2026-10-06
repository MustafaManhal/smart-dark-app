import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColor, type NormRect } from "../db/annotations";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { canReadClipboard, readClipboardText } from "../platform/clipboard";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

type Anchor = { left: number; top: number; right: number; bottom: number };

/** Tap a highlight: recolor, copy, or remove it in one tap. */
export function HighlightPopover({ highlight, anchor, onColor, onCopy, onRemove, onClose }: {
  highlight: Highlight;
  anchor: Anchor;
  onColor: (c: HighlightColor) => void;
  onCopy: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  // Delete or Backspace removes the open highlight. A layout effect, so the key
  // works from the moment the menu is on screen.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      onRemove();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onRemove]);
  return (
    <Popover anchor={anchor} label={t("Highlight")} onClose={onClose}>
      <div class="pop-row">
        <div class="pop-colors" role="radiogroup" aria-label={t("Highlight color")}>
          {HIGHLIGHT_COLORS.map((c) => (
            <button type="button" role="radio" class="swatch" aria-checked={c === highlight.color} aria-label={t(COLOR_LABEL[c])}
              style={{ background: COLOR_HEX[c] }} onClick={() => onColor(c)} />
          ))}
        </div>
        <span class="pop-sep" />
        <button type="button" class="pop-action" aria-label={t("Copy text")} onClick={onCopy}>
          <Icon name="copy" size={18} />
        </button>
        <button type="button" class="pop-action is-danger" onClick={onRemove}>
          <Icon name="trash" size={18} /> {t("Remove")}
        </button>
      </div>
    </Popover>
  );
}

export type NoteDraft = { id?: string; page: number; rects: NormRect[]; text: string; body: string; title?: string; createdAt?: number };

/** Write or edit a note on a passage. */
export function NotePopover({ note, anchor, onSave, onDelete, onClose }: {
  note: NoteDraft;
  anchor: Anchor;
  onSave: (body: string, title: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState(note.body);
  const [title, setTitle] = useState(note.title ?? "");
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setTimeout(() => area.current?.focus(), 30);
  }, []);
  const close = () => {
    // Clicking away keeps what was typed; an empty new note is simply dropped.
    if (body.trim() && (body !== note.body || title !== (note.title ?? ""))) onSave(body, title.trim());
    onClose();
  };
  // Paste at the cursor, for screens where the system paste menu is slow to reach.
  const paste = async () => {
    const text = await readClipboardText();
    const el = area.current;
    if (!text || !el) return;
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  };
  return (
    <Popover anchor={anchor} label={t("Note")} onClose={close}>
      <div class="pop-note">
        <blockquote class="pop-quote" dir="auto">{note.text}</blockquote>
        <input class="pop-title" type="text" dir="auto" aria-label={t("Note title")} placeholder={t("Title")} value={title} maxLength={80}
          onInput={(e) => setTitle(e.currentTarget.value)} />
        <textarea ref={area} dir="auto" aria-label={t("Note text")} rows={4} placeholder={t("Write your note")} value={body}
          onInput={(e) => setBody(e.currentTarget.value)} />
        <div class="pop-actions">
          {note.id && <Button variant="danger" onClick={onDelete}>{t("Delete")}</Button>}
          {canReadClipboard() && <Button onClick={paste}><Icon name="paste" size={16} /> {t("Paste")}</Button>}
          <span class="grow" />
          <Button onClick={onClose}>{t("Cancel")}</Button>
          <Button variant="primary" disabled={!body.trim()} onClick={() => { onSave(body, title.trim()); onClose(); }}>{t("Save")}</Button>
        </div>
      </div>
    </Popover>
  );
}
