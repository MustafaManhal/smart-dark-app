import { useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { penPaths, SIGN_BREAK, thin } from "./shapes";

const W = 300;
const H = 100;

/**
 * A place to write a signature once. It is kept on this device (in the
 * settings) and then placed on a page with a tap. `strokes` come back as one
 * list: x, y, pressure for each point in a box 1 wide and 1 high, with
 * SIGN_BREAK between the strokes.
 */
export function SignaturePad({ open, onSave, onClose }: { open: boolean; onSave: (points: number[]) => void; onClose: () => void }) {
  const [strokes, setStrokes] = useState<number[][]>([]);
  const drawing = useRef<number[] | null>(null);
  const box = useRef<SVGSVGElement>(null);

  const place = (e: PointerEvent): [number, number, number] => {
    const r = box.current!.getBoundingClientRect();
    const within = (v: number) => Math.min(1, Math.max(0, v));
    return [within((e.clientX - r.left) / r.width), within((e.clientY - r.top) / r.height), e.pointerType === "pen" ? e.pressure || 0.5 : 0.5];
  };
  // Each event works out the stroke as it is now and hands that to the state: nothing is read later from a ref.
  const down = (e: PointerEvent) => {
    e.preventDefault();
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch {}
    const stroke = [...place(e)];
    drawing.current = stroke;
    setStrokes((all) => [...all, stroke]);
  };
  const move = (e: PointerEvent) => {
    if (!drawing.current) return;
    const stroke = [...drawing.current, ...place(e)];
    drawing.current = stroke;
    setStrokes((all) => [...all.slice(0, -1), stroke]);
  };
  const up = () => { drawing.current = null; };
  const close = () => {
    setStrokes([]);
    onClose();
  };

  return (
    <Sheet open={open} title={t("Your signature")} onClose={close}>
      <p class="sign-note">{t("Write your signature in the box. It is kept on this device and placed on a page with a tap.")}</p>
      <svg ref={box} class="sign-pad" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Signature box")}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <line x1="16" y1={H * 0.78} x2={W - 16} y2={H * 0.78} class="sign-rule" />
        {strokes.flatMap((stroke) => penPaths(stroke, 0.008, W, H)).map((p) => (
          <path d={p.d} fill="none" stroke="currentColor" stroke-width={p.width} stroke-linecap="round" stroke-linejoin="round" />
        ))}
      </svg>
      <div class="sheet-actions">
        <Button onClick={() => setStrokes([])} disabled={!strokes.length}>{t("Clear")}</Button>
        <Button variant="primary" disabled={!strokes.length} onClick={() => {
          onSave(strokes.flatMap((stroke, i) => [...(i ? SIGN_BREAK : []), ...thin(stroke, 0.004)]));
          setStrokes([]);
        }}>{t("Use this signature")}</Button>
      </div>
    </Sheet>
  );
}
