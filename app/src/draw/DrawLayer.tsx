import type { Drawing } from "../db/drawings";
import { arrowHead, DRAW_HEX, penPaths, strokesOf, TEXT_SIZE } from "./shapes";

const colorOf = (d: Drawing) => (d.color === "ink" ? "var(--draw-ink)" : DRAW_HEX[d.color]);

/** One drawing as SVG, in a box `w` by `h` (the page in PDF units). */
function Shape({ d, w, h }: { d: Drawing; w: number; h: number }) {
  const stroke = colorOf(d);
  const width = d.size * w;
  const common = { fill: "none", stroke, "stroke-width": width, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };
  const [x1, y1, x2, y2] = [d.points[0] * w, d.points[1] * h, d.points[2] * w, d.points[3] * h];
  let body;
  if (d.tool === "pen" || d.tool === "sign") {
    body = strokesOf(d.points).flatMap((stroke) => penPaths(stroke, d.size, w, h)).map((p) => <path d={p.d} {...common} stroke-width={p.width} />);
  }
  else if (d.tool === "line") body = <path d={`M${x1} ${y1}L${x2} ${y2}`} {...common} />;
  else if (d.tool === "arrow") {
    const [ax, ay, tx, ty, bx, by] = arrowHead(x1, y1, x2, y2, Math.max(width * 4, w * 0.018));
    body = <path d={`M${x1} ${y1}L${x2} ${y2}M${ax} ${ay}L${tx} ${ty}L${bx} ${by}`} {...common} />;
  } else if (d.tool === "rect") body = <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx={width} {...common} />;
  else body = <ellipse cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} {...common} />;
  // An unseen, wider copy of the line: what the eraser's tap has to hit.
  const reach = Math.max(width * 2, w * 0.022);
  const hit = d.tool === "pen" || d.tool === "sign"
    ? <path class="draw-hit" d={strokesOf(d.points).map((s) => `M${Array.from({ length: s.length / 3 }, (_, i) => `${s[i * 3] * w} ${s[i * 3 + 1] * h}`).join("L")}l0.01 0`).join("")} />
    : d.tool === "rect" ? <rect class="draw-hit" x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} />
    : d.tool === "ellipse" ? <ellipse class="draw-hit" cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} rx={Math.abs(x2 - x1) / 2} ry={Math.abs(y2 - y1) / 2} />
    : <path class="draw-hit" d={`M${x1} ${y1}L${x2} ${y2}`} />;
  return <g data-draw={d.id} class="draw-shape" style={{ "--reach": `${reach}px` }}>{body}{hit}</g>;
}

/**
 * Everything drawn on one page: pen strokes and shapes as one SVG, text boxes
 * as text. It lies in the page's face, so it turns and zooms with the page.
 * `live` is the stroke being drawn right now.
 */
export function DrawLayer({ drawings, live, w, h, editing, onText }: {
  drawings: Drawing[]; live: Drawing | null; w: number; h: number;
  /** The text box being written, by id ("new" for one not saved yet). */
  editing: string | null;
  onText: (drawing: Drawing, text: string) => void;
}) {
  const all = live ? [...drawings, live] : drawings;
  return (
    <>
      <svg class="draw-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
        {all.filter((d) => d.tool !== "text").map((d) => <Shape key={d.id} d={d} w={w} h={h} />)}
      </svg>
      {all.filter((d) => d.tool === "text").map((d) => {
        const style = { left: `${d.points[0] * 100}%`, top: `${d.points[1] * 100}%`, color: colorOf(d), fontSize: `calc(var(--scale-factor) * ${(TEXT_SIZE * w * (d.size / 0.004) ** 0.5).toFixed(2)}px)` };
        // The box being written is its own element, which only the browser fills: typing and Preact do not mix.
        if (editing === d.id) {
          return (
            <div key={`edit-${d.id}`} class="draw-text is-editing" data-draw={d.id} dir="auto" contentEditable={"plaintext-only" as never} style={style}
              ref={(el) => {
                if (!el || el.dataset.ready) return;
                el.dataset.ready = "1";
                el.textContent = d.text ?? "";
                el.focus();
                // The caret goes after the last letter.
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(false);
                getSelection()?.removeAllRanges();
                getSelection()?.addRange(range);
              }}
              onBlur={(e) => onText(d, (e.currentTarget.textContent ?? "").trim())}
              onKeyDown={(e) => {
                if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) e.currentTarget.blur();
                e.stopPropagation(); // typing is not a shortcut of the reader
                // End, Home and the page keys would scroll the book under the box (the browser does that when the
                // caret has nowhere to go). Here End and Home move the caret through the box and nothing else.
                if (["End", "Home", "PageUp", "PageDown"].includes(e.key)) {
                  e.preventDefault();
                  if (e.key === "End" || e.key === "Home") {
                    const range = document.createRange();
                    range.selectNodeContents(e.currentTarget);
                    range.collapse(e.key === "Home");
                    getSelection()?.removeAllRanges();
                    getSelection()?.addRange(range);
                  }
                }
              }} />
          );
        }
        return <div key={d.id} class="draw-text" data-draw={d.id} dir="auto" style={style}>{d.text}</div>;
      })}
    </>
  );
}
