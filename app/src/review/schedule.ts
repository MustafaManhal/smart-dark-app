import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from "ts-fsrs";
import type { ReviewState } from "../db/reviews";
import type { NotebookItem } from "../notebook/items";

// The open FSRS scheduler (ts-fsrs, MIT). No fuzz: the same answer on the same day gives the same date,
// which keeps the intervals shown on the buttons true.
const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));

export const GRADES = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;
export type Answer = (typeof GRADES)[number];

const toCard = (s: ReviewState): Card => ({
  ...s, due: new Date(s.due), last_review: s.last_review === null ? undefined : new Date(s.last_review),
});
const fromCard = (id: string, card: Card, firstAt: number): ReviewState => ({
  id, due: card.due.getTime(), stability: card.stability, difficulty: card.difficulty, elapsed_days: card.elapsed_days,
  scheduled_days: card.scheduled_days, reps: card.reps, lapses: card.lapses, learning_steps: card.learning_steps, state: card.state,
  last_review: card.last_review ? card.last_review.getTime() : null, firstAt,
});

/** The schedule of a mark after an answer. `state` is undefined for a mark seen for the first time. */
export function answer(id: string, state: ReviewState | undefined, grade: Answer, now: number): ReviewState {
  const card = state ? toCard(state) : createEmptyCard(new Date(now));
  return fromCard(id, scheduler.next(card, new Date(now), grade as Grade).card, state?.firstAt ?? now);
}

/** When each answer would bring the mark back, as short words for the buttons: "10 min", "4 days". */
export function comesBack(state: ReviewState | undefined, now: number): Record<Answer, { minutes: number }> {
  const out = {} as Record<Answer, { minutes: number }>;
  for (const grade of GRADES) out[grade] = { minutes: Math.max(1, Math.round((answer("", state, grade, now).due - now) / 60_000)) };
  return out;
}

/** A local calendar day as YYYY-MM-DD. */
export const dayKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A mark with words can be reviewed; a marked area or an empty sticky note has nothing to ask. */
export const reviewable = (item: NotebookItem) => !!(item.passage.trim() || item.note.trim() || item.title.trim());

/**
 * What to review now: first the marks whose time has come (the most overdue
 * first), then marks never reviewed, oldest first, up to the day's limit of
 * new ones.
 */
export function buildQueue(items: NotebookItem[], states: ReviewState[], now: number, newPerDay: number) {
  const byId = new Map(states.map((s) => [s.id, s]));
  const cards = items.filter(reviewable);
  const due = cards.filter((item) => (byId.get(item.id)?.due ?? Infinity) <= now)
    .sort((a, b) => byId.get(a.id)!.due - byId.get(b.id)!.due);
  const today = dayKey(now);
  const startedToday = states.filter((s) => dayKey(s.firstAt) === today).length;
  const fresh = cards.filter((item) => !byId.has(item.id)).sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, Math.max(0, newPerDay - startedToday));
  return { due, fresh, waiting: cards.length - due.length - fresh.length };
}

/** Days in a row with a review, ending today or yesterday. */
export function reviewStreak(days: string[], now: number): number {
  const done = new Set(days);
  let day = new Date(now);
  if (!done.has(dayKey(day.getTime()))) day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  let streak = 0;
  while (done.has(dayKey(day.getTime()))) {
    streak++;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1);
  }
  return streak;
}
