import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

type Anchor = { left: number; top: number; right: number; bottom: number };

/**
 * A small panel next to something on screen (below it, or above when there is
 * no room), kept inside the window. Closes on Escape or a click outside.
 */
export function Popover({ anchor, label, onClose, children }: {
  anchor: Anchor;
  label: string;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  useLayoutEffect(() => {
    const el = box.current!;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const margin = 8;
    const below = anchor.bottom + margin;
    const top = below + h < innerHeight - margin ? below : Math.max(margin, anchor.top - h - margin);
    const center = (anchor.left + anchor.right) / 2;
    const left = Math.min(Math.max(margin, center - w / 2), innerWidth - w - margin);
    setPos({ left, top });
  }, [anchor.left, anchor.top, anchor.right, anchor.bottom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    document.addEventListener("keydown", onKey);
    // Delay so the click that opened the popover does not close it.
    const t = setTimeout(() => document.addEventListener("pointerdown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div ref={box} class="popover" role="dialog" aria-label={label} style={{ left: `${pos.left}px`, top: `${pos.top}px` }}>
      {children}
    </div>
  );
}
