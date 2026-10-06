import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { HIGHLIGHT_COLORS, type Sticky } from "../db/annotations";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { COLOR_HEX, COLOR_LABEL } from "./colors";

type Props = {
  note: Sticky;
  autoFocus: boolean;
  onChange: (note: Sticky) => void;
  onDelete: (note: Sticky) => void;
};

/** A sticky note on the page: drag by its header, type in its body. */
export function StickyNote({ note, autoFocus, onChange, onDelete }: Props) {
  const [text, setText] = useState(note.text);
  const [title, setTitle] = useState(note.title ?? "");
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [palette, setPalette] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef(0);

  useEffect(() => setPos({ x: note.x, y: note.y }), [note.x, note.y]);
  useEffect(() => {
    if (autoFocus && !note.collapsed) area.current?.focus();
  }, [autoFocus]);

  const save = (patch: Partial<Sticky>) => onChange({ ...note, text, title, ...pos, ...patch });

  function onType(value: string) {
    setText(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onChange({ ...note, ...pos, title, text: value }), 400);
  }

  function onTitle(value: string) {
    setTitle(value);
    clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onChange({ ...note, ...pos, text, title: value }), 400);
  }

  function startDrag(e: PointerEvent) {
    if ((e.target as Element).closest("button, input")) return;
    const page = root.current!.parentElement!.getBoundingClientRect();
    const box = root.current!.getBoundingClientRect();
    const dx = e.clientX - box.left;
    const dy = e.clientY - box.top;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    let latest = pos;
    const move = (ev: PointerEvent) => {
      const maxX = 1 - box.width / page.width;
      const maxY = 1 - box.height / page.height;
      latest = {
        x: Math.min(Math.max(0, (ev.clientX - dx - page.left) / page.width), Math.max(0, maxX)),
        y: Math.min(Math.max(0, (ev.clientY - dy - page.top) / page.height), Math.max(0, maxY)),
      };
      setPos(latest);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      onChange({ ...note, text, title, ...latest });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  const style = { left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, "--note": COLOR_HEX[note.color] };

  if (note.collapsed) {
    return (
      <div ref={root} class="sticky is-collapsed" style={style}>
        <button type="button" class="sticky-tab" aria-label={t("Open sticky note: {text}", { text: title || text || t("empty") })}
          onClick={() => save({ collapsed: false })}>
          <Icon name="sticky" size={18} />
          {title && <span class="sticky-tab-title">{title}</span>}
        </button>
      </div>
    );
  }

  return (
    <div ref={root} class="sticky" style={style} role="group" aria-label={t("Sticky note")}>
      <div class="sticky-head" onPointerDown={startDrag} title={t("Drag to move")}>
        <button type="button" class="sticky-dot" aria-label={t("Note color")} aria-expanded={palette}
          onClick={() => setPalette((v) => !v)} />
        <span class="sticky-grip" aria-hidden="true" />
        <IconButton label={t("Collapse note")} icon="collapse" onClick={() => save({ collapsed: true })} />
        <IconButton label={t("Delete note")} icon="trash" onClick={() => onDelete(note)} />
      </div>
      {palette && (
        <div class="sticky-palette" role="radiogroup" aria-label={t("Note color")}>
          {HIGHLIGHT_COLORS.map((c) => (
            <button type="button" role="radio" aria-checked={c === note.color} aria-label={t(COLOR_LABEL[c])}
              style={{ background: COLOR_HEX[c] }} onClick={() => { setPalette(false); save({ color: c }); }} />
          ))}
        </div>
      )}
      <input class="sticky-title" type="text" aria-label={t("Note title")} placeholder={t("Title")} value={title} maxLength={80}
        onInput={(e) => onTitle(e.currentTarget.value)}
        onBlur={() => { clearTimeout(saveTimer.current); if (title !== (note.title ?? "")) save({}); }} />
      <textarea ref={area} aria-label={t("Sticky note text")} placeholder={t("Write a note")} value={text}
        onInput={(e) => onType(e.currentTarget.value)}
        onBlur={() => { clearTimeout(saveTimer.current); if (text !== note.text) save({}); }} />
    </div>
  );
}
