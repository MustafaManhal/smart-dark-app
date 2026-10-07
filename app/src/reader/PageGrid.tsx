import { useEffect, useRef } from "preact/hooks";
import { t } from "../i18n/i18n";
import type { Renderer } from "./renderer";

const THUMB_WIDTH = 132;

/**
 * Every page of the book as a small picture, in the page style being read.
 * Pictures are made only for the pages scrolled into view, one at a time.
 */
export function PageGrid({ renderer, total, current, bookmarked, noted, onPick }: {
  renderer: Renderer;
  total: number;
  current: number;
  bookmarked: Set<number>;
  noted: Set<number>;
  onPick: (page: number) => void;
}) {
  const grid = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const root = grid.current!;
    const queue: number[] = [];
    const done = new Set<number>();
    let busy = false;
    let stopped = false;
    const work = async () => {
      if (busy) return;
      busy = true;
      while (queue.length && !stopped) {
        const n = queue.pop()!; // the page that came into view last is the one being looked at
        if (done.has(n)) continue;
        done.add(n);
        const holder = root.querySelector<HTMLElement>(`[data-thumb="${n}"]`);
        const canvas = await renderer.thumbnail(n, THUMB_WIDTH).catch(() => null);
        if (stopped) break;
        if (canvas && holder) holder.replaceChildren(canvas);
      }
      busy = false;
    };
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        queue.push(Number((e.target as HTMLElement).dataset.thumb));
        seen.unobserve(e.target);
      }
      work();
    }, { root: root.closest(".sheet, .panel-body"), rootMargin: "300px 0px" });
    for (const el of root.querySelectorAll("[data-thumb]")) seen.observe(el);
    // Start where the reader is.
    root.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "center" });
    return () => {
      stopped = true;
      seen.disconnect();
    };
  }, [renderer, total]);

  return (
    <ol ref={grid} class="page-grid" aria-label={t("Pages")}>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <li>
          <button type="button" class="thumb" aria-current={n === current ? "page" : undefined}
            aria-label={t("Page {page}", { page: n })} onClick={() => onPick(n)}>
            <span class="thumb-page" data-thumb={n} style={{ aspectRatio: String(renderer.aspect(n)) }} />
            <span class="thumb-foot">
              <span class="thumb-number">{n}</span>
              {bookmarked.has(n) && <span class="thumb-mark is-bookmark" title={t("Bookmarked page")} />}
              {noted.has(n) && <span class="thumb-mark is-note" title={t("Notes and highlights")} />}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
