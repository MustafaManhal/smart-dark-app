import { useEffect, useRef, useState } from "preact/hooks";
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColor, type NormRect } from "../db/annotations";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Popover } from "../ui/Popover";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

type Anchor = { left: number; top: number; right: number; bottom: number };

/** Tap a highlight: recolor, copy, or remove it in one tap. */
export function HighlightPopover({ highlight, anchor, onColor, onRemove, onClose }: {
  highlight: Highlight;
  anchor: Anchor;
  onColor: (c: HighlightColor) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} label="Highlight" onClose={onClose}>
      <div class="pop-row">
        <div class="pop-colors" role="radiogroup" aria-label="Highlight color">
          {HIGHLIGHT_COLORS.map((c) => (
            <button type="button" role="radio" class="swatch" aria-checked={c === highlight.color} aria-label={COLOR_LABEL[c]}
              style={{ background: COLOR_HEX[c] }} onClick={() => onColor(c)} />
          ))}
        </div>
        <span class="pop-sep" />
        <button type="button" class="pop-action" aria-label="Copy text"
          onClick={() => { navigator.clipboard?.writeText(highlight.text); onClose(); }}>
          <Icon name="copy" size={18} />
        </button>
        <button type="button" class="pop-action is-danger" onClick={onRemove}>
          <Icon name="trash" size={18} /> Remove
        </button>
      </div>
    </Popover>
  );
}

export type NoteDraft = { id?: string; page: number; rects: NormRect[]; text: string; body: string; createdAt?: number };

/** Write or edit a note on a passage. */
export function NotePopover({ note, anchor, onSave, onDelete, onClose }: {
  note: NoteDraft;
  anchor: Anchor;
  onSave: (body: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState(note.body);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setTimeout(() => area.current?.focus(), 30);
  }, []);
  const close = () => {
    // Clicking away keeps what was typed; an empty new note is simply dropped.
    if (body.trim() && body !== note.body) onSave(body);
    onClose();
  };
  return (
    <Popover anchor={anchor} label="Note" onClose={close}>
      <div class="pop-note">
        <blockquote class="pop-quote">{note.text}</blockquote>
        <textarea ref={area} aria-label="Note text" rows={4} placeholder="Write your note" value={body}
          onInput={(e) => setBody(e.currentTarget.value)} />
        <div class="pop-actions">
          {note.id && <Button variant="danger" onClick={onDelete}>Delete</Button>}
          <span class="grow" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!body.trim()} onClick={() => { onSave(body); onClose(); }}>Save</Button>
        </div>
      </div>
    </Popover>
  );
}
