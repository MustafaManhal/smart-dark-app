import { useEffect, useRef, useState } from "preact/hooks";
import { HIGHLIGHT_COLORS, type Highlight } from "../db/annotations";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

export function HighlightSheet({ highlight, focusNote, onSave, onDelete, onClose }: {
  highlight: Highlight | null;
  focusNote: boolean;
  onSave: (h: Highlight) => void;
  onDelete: (h: Highlight) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setNote(highlight?.note ?? "");
    if (highlight && focusNote) setTimeout(() => area.current?.focus(), 50);
  }, [highlight?.id]);
  if (!highlight) return null;

  const close = () => {
    if (note !== highlight.note) onSave({ ...highlight, note });
    onClose();
  };

  return (
    <Sheet open title="Highlight" onClose={close}>
      <blockquote class="hl-quote" style={{ "--hl": COLOR_HEX[highlight.color] }}>{highlight.text}</blockquote>
      <div class="hl-colors" role="radiogroup" aria-label="Highlight color">
        {HIGHLIGHT_COLORS.map((c) => (
          <button type="button" role="radio" aria-checked={c === highlight.color} aria-label={COLOR_LABEL[c]}
            class="swatch" style={{ background: COLOR_HEX[c] }} onClick={() => onSave({ ...highlight, color: c, note })} />
        ))}
      </div>
      <label class="field-label" for="hl-note">Note</label>
      <textarea id="hl-note" ref={area} class="note-input" rows={4} placeholder="Add a note" value={note}
        onInput={(e) => setNote(e.currentTarget.value)} />
      <div class="sheet-actions">
        <Button variant="danger" onClick={() => onDelete(highlight)}>Delete</Button>
        <Button onClick={() => navigator.clipboard?.writeText(highlight.text)}>Copy text</Button>
        <Button variant="primary" onClick={close}>Done</Button>
      </div>
    </Sheet>
  );
}
