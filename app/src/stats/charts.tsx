import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { locale, t } from "../i18n/i18n";
import { dayKey, shiftDay, type DayTotal, type Goal } from "./compute";

const fmtDay = (ts: number) => new Date(ts).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" });
const minutes = (ms: number) => Math.round(ms / 60_000);
const valueOf = (d: DayTotal | undefined, unit: Goal["unit"]) => (unit === "minutes" ? minutes(d?.ms ?? 0) : d?.pages ?? 0);
const unitLabel = (v: number, unit: Goal["unit"]) =>
  unit === "minutes" ? t("{n} min", { n: v }) : t(v === 1 ? "1 page" : "{n} pages", { n: v });

type Tip = { x: number; y: number; title: string; value: string } | null;

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div class="chart-tip" role="tooltip" style={{ left: `${tip.x}px`, top: `${tip.y}px` }}>
      <strong>{tip.value}</strong>
      <span>{tip.title}</span>
    </div>
  );
}

/** Last 14 days as bars (one series, so no legend), with the daily goal as a reference line. */
export function DaysChart({ days, goal, unit, now }: { days: Map<string, DayTotal>; goal: Goal; unit: Goal["unit"]; now: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const items = Array.from({ length: 14 }, (_, i) => {
    const t = shiftDay(now, 13 - i);
    return { t, v: valueOf(days.get(dayKey(t)), unit) };
  });
  const goalValue = goal.unit === unit ? goal.value : 0;
  const max = Math.max(1, goalValue, ...items.map((i) => i.v));
  const show = (e: Event, i: (typeof items)[number]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const host = (e.currentTarget as HTMLElement).closest(".days-chart")!.getBoundingClientRect();
    setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, title: fmtDay(i.t), value: unitLabel(i.v, unit) });
  };
  return (
    <div class="days-chart" onPointerLeave={() => setTip(null)}>
      <div class="days-plot">
        {goalValue > 0 && (
          <div class="goal-line" style={{ bottom: `${(goalValue / max) * 100}%` }}>
            <span>{t("Goal")} {unitLabel(goalValue, unit)}</span>
          </div>
        )}
        {items.map((i) => (
          <button type="button" class="day-col" aria-label={`${fmtDay(i.t)}: ${unitLabel(i.v, unit)}`}
            onPointerMove={(e) => show(e, i)} onFocus={(e) => show(e, i)} onBlur={() => setTip(null)}>
            <span class={`day-bar ${i.v === 0 ? "is-zero" : ""}`} style={{ height: `${(i.v / max) * 100}%` }} />
          </button>
        ))}
      </div>
      <div class="days-axis" aria-hidden="true">
        {items.map((i, n) => <span>{n === 13 ? t("Today") : (13 - n) % 2 === 1 ? "" : new Date(i.t).toLocaleDateString(locale(), { day: "numeric" })}</span>)}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Calendar heatmap of the last 26 weeks: one blue ramp, darker = more reading. */
export function Heatmap({ days, unit, now }: { days: Map<string, DayTotal>; unit: Goal["unit"]; now: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // Narrow screens scroll the calendar: start at the most recent weeks.
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, []);
  const weeks = 26;
  const today = new Date(now);
  const lastSunday = shiftDay(now, today.getDay());
  const start = shiftDay(lastSunday, (weeks - 1) * 7);
  const cells: { t: number; v: number; future: boolean }[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const t = shiftDay(start, -(w * 7 + d));
      cells.push({ t, v: valueOf(days.get(dayKey(t)), unit), future: t > now });
    }
  }
  const max = Math.max(...cells.map((c) => c.v));
  const level = (v: number) => (v === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const months: { col: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const first = cells[w * 7].t;
    const m = new Date(first).getMonth();
    if (w === 0 || new Date(cells[(w - 1) * 7].t).getMonth() !== m) {
      months.push({ col: w, label: new Date(first).toLocaleDateString(locale(), { month: "short" }) });
    }
  }
  const show = (e: Event, c: (typeof cells)[number]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const host = (e.currentTarget as HTMLElement).closest(".heatmap")!.getBoundingClientRect();
    setTip({ x: r.left - host.left + r.width / 2, y: r.top - host.top, title: fmtDay(c.t), value: unitLabel(c.v, unit) });
  };
  return (
    <div class="heatmap" onPointerLeave={() => setTip(null)}>
      <div class="heat-scroll" ref={scroller}>
        <div class="heat-months" style={{ gridTemplateColumns: `repeat(${weeks}, var(--cell))` }} aria-hidden="true">
          {months.map((m) => <span style={{ gridColumn: `${m.col + 1} / span 3` }}>{m.label}</span>)}
        </div>
        <div class="heat-grid" role="grid" aria-label={t("Reading per day, last {n} weeks", { n: weeks })}>
          {cells.map((c) => (
            <button type="button" class={`heat-cell l${level(c.v)} ${c.future ? "is-future" : ""}`} tabIndex={c.future ? -1 : 0}
              aria-label={c.future ? undefined : `${fmtDay(c.t)}: ${unitLabel(c.v, unit)}`} disabled={c.future}
              onPointerMove={(e) => !c.future && show(e, c)} onFocus={(e) => show(e, c)} onBlur={() => setTip(null)} />
          ))}
        </div>
      </div>
      <div class="heat-legend" aria-hidden="true">
        {t("Less")} {[0, 1, 2, 3, 4].map((l) => <span class={`heat-cell l${l}`} />)} {t("More")}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
