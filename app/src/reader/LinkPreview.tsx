import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import type { Target } from "./pdf";
import type { Renderer } from "./renderer";

const HEIGHT = 190;

/**
 * A small look at the place a link leads to, shown next to the link: the part
 * of the target page around the spot the link points at. With `onGo` (touch
 * screens, after a long press) it has a button to go there.
 */
export function LinkPreview({ renderer, target, anchor, onGo, onEnter, onLeave }: {
  renderer: Renderer; target: Target; anchor: DOMRect; onGo?: () => void; onEnter?: () => void; onLeave?: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const width = Math.min(340, innerWidth - 24);

  useEffect(() => {
    let live = true;
    setLoading(true);
    renderer.thumbnail(target.page, width).then((canvas) => {
      if (!live || !view.current) return;
      const shown = width / renderer.aspect(target.page); // height of the whole page at this width
      canvas.style.width = `${width}px`;
      canvas.style.height = `${shown}px`;
      // Start a little above the spot, and never past the end of the page.
      const from = Math.min(Math.max(0, shown - HEIGHT), Math.max(0, (target.top ?? 0) * shown - 14));
      canvas.style.translate = `0 ${-from}px`;
      view.current.replaceChildren(canvas);
      setLoading(false);
    }).catch(() => {});
    return () => { live = false; };
  }, [renderer, target.page, target.top, width]);

  // Under the link when there is room, over it when not; always inside the screen.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const h = el.offsetHeight;
    const below = anchor.bottom + 8 + h <= innerHeight - 8;
    el.style.top = `${Math.max(8, below ? anchor.bottom + 8 : anchor.top - 8 - h)}px`;
    el.style.left = `${Math.min(innerWidth - width - 12, Math.max(12, anchor.left + anchor.width / 2 - width / 2))}px`;
  }, [anchor, width, onGo]);

  return (
    <div class="link-preview" ref={box} style={{ width: `${width}px` }} role={onGo ? "dialog" : "tooltip"}
      aria-label={t("Page {page}", { page: target.page })} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div class={`link-preview-view ${loading ? "is-loading" : ""}`} ref={view} style={{ height: `${HEIGHT}px` }} />
      <div class="link-preview-foot">
        <span>{t("Page {page}", { page: target.page })}</span>
        {onGo && <button type="button" class="btn btn-primary" onClick={onGo}>{t("Go there")}</button>}
      </div>
    </div>
  );
}
