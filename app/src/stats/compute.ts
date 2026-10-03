import type { Session } from "../db/sessions";

export type Goal = { unit: "minutes" | "pages"; value: number }; // value 0 = no goal
export type DayTotal = { ms: number; pages: number };
export type TimeSlot = "morning" | "afternoon" | "evening" | "night";

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight of the day `days` before ts (DST-safe: works on calendar dates). */
export function shiftDay(ts: number, days: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days).getTime();
}

/** Minutes and distinct pages (per book) for every day with reading. */
export function dailyTotals(sessions: Session[]): Map<string, DayTotal> {
  const days = new Map<string, DayTotal & { seen: Set<string> }>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    const day = days.get(key) ?? { ms: 0, pages: 0, seen: new Set<string>() };
    day.ms += s.activeMs;
    for (const p of s.pages) day.seen.add(`${s.bookId}:${p}`);
    day.pages = day.seen.size;
    days.set(key, day);
  }
  return new Map([...days].map(([k, { ms, pages }]) => [k, { ms, pages }]));
}

export function goalMet(day: DayTotal | undefined, goal: Goal): boolean {
  if (!day) return false;
  if (goal.value <= 0) return day.ms >= 60_000; // without a goal: at least a minute of reading
  return goal.unit === "minutes" ? day.ms >= goal.value * 60_000 : day.pages >= goal.value;
}

/** Consecutive days meeting the goal, ending today (or yesterday while today is still open). */
export function currentStreak(days: Map<string, DayTotal>, goal: Goal, now: number): number {
  let streak = 0;
  let offset = goalMet(days.get(dayKey(now)), goal) ? 0 : 1;
  while (goalMet(days.get(dayKey(shiftDay(now, offset))), goal)) {
    streak++;
    offset++;
  }
  return streak;
}

export function bestStreak(days: Map<string, DayTotal>, goal: Goal): number {
  const met = [...days.keys()].filter((k) => goalMet(days.get(k), goal)).sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of met) {
    const [y, m, d] = key.split("-").map(Number);
    const t = new Date(y, m - 1, d).getTime();
    run = prev !== null && dayKey(shiftDay(t, 1)) === dayKey(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/** Share of days (since the first reading day, up to 30) that met the goal. Null without a goal. */
export function goalHitRate(days: Map<string, DayTotal>, goal: Goal, now: number): number | null {
  if (goal.value <= 0 || !days.size) return null;
  const first = [...days.keys()].sort()[0];
  let total = 0;
  let met = 0;
  for (let i = 0; i < 30; i++) {
    const key = dayKey(shiftDay(now, i));
    if (key < first) break;
    total++;
    if (goalMet(days.get(key), goal)) met++;
  }
  return total ? met / total : null;
}

export function slotOf(hour: number): TimeSlot {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export function insights(sessions: Session[], _now: number) {
  const days = dailyTotals(sessions);
  const totalMs = sessions.reduce((a, s) => a + s.activeMs, 0);
  const pages = [...days.values()].reduce((a, d) => a + d.pages, 0);
  const slots = new Map<TimeSlot, number>();
  for (const s of sessions) {
    const slot = slotOf(new Date(s.start).getHours());
    slots.set(slot, (slots.get(slot) ?? 0) + s.activeMs);
  }
  const bestSlot = [...slots].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    totalMs,
    sessionCount: sessions.length,
    avgSessionMs: sessions.length ? Math.round(totalMs / sessions.length) : 0,
    activeDays: days.size,
    pagesPerDay: days.size ? pages / days.size : 0,
    bestSlot,
  };
}

/** Per-book totals, most read first. */
export function bookTotals(sessions: Session[]) {
  const books = new Map<string, { ms: number; sessions: number; pages: Set<number> }>();
  for (const s of sessions) {
    const b = books.get(s.bookId) ?? { ms: 0, sessions: 0, pages: new Set<number>() };
    b.ms += s.activeMs;
    b.sessions++;
    s.pages.forEach((p) => b.pages.add(p));
    books.set(s.bookId, b);
  }
  return [...books].map(([bookId, b]) => ({ bookId, ms: b.ms, sessions: b.sessions, pages: b.pages.size })).sort((a, b) => b.ms - a.ms);
}

/** Last `count` days, oldest first, with totals (zero when nothing was read). */
export function lastDays(days: Map<string, DayTotal>, now: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = shiftDay(now, count - 1 - i);
    return { key: dayKey(t), date: t, ...(days.get(dayKey(t)) ?? { ms: 0, pages: 0 }) };
  });
}

