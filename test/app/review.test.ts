// @vitest-environment node
import { Rating } from "ts-fsrs";
import { expect, test } from "vitest";
import type { NotebookItem } from "../../app/src/notebook/items";
import { answer, buildQueue, comesBack, dayKey, reviewable, reviewStreak } from "../../app/src/review/schedule";

const DAY = 86_400_000;
const now = new Date(2026, 9, 7, 10, 0).getTime();
const item = (id: string, extra: Partial<NotebookItem> = {}): NotebookItem => ({
  id, kind: "highlight", bookId: "b", bookTitle: "Book", bookAuthor: "", tags: [], page: 1, passage: `passage ${id}`, note: "", title: "", updatedAt: 0, ...extra,
});

test("a new mark answered Good comes back in minutes, then in days, and further each time", () => {
  const first = answer("a", undefined, Rating.Good, now);
  expect(first.firstAt).toBe(now);
  expect(first.due - now).toBe(10 * 60_000);
  const second = answer("a", first, Rating.Good, first.due);
  expect(second.due - first.due).toBeGreaterThanOrEqual(DAY);
  const third = answer("a", second, Rating.Good, second.due);
  expect(third.due - second.due).toBeGreaterThan(second.due - first.due);
  expect(third.firstAt).toBe(now);
  expect(third.reps).toBe(3);
});

test("Again brings a mark back sooner than Good, Easy later", () => {
  const back = comesBack(undefined, now);
  expect(back[Rating.Again].minutes).toBeLessThan(back[Rating.Good].minutes);
  expect(back[Rating.Easy].minutes).toBeGreaterThan(back[Rating.Good].minutes * 100);
  const known = answer("a", answer("a", undefined, Rating.Easy, now), Rating.Good, now + 9 * DAY);
  const later = comesBack(known, known.due);
  expect(later[Rating.Again].minutes).toBeLessThan(later[Rating.Hard].minutes);
  expect(later[Rating.Hard].minutes).toBeLessThanOrEqual(later[Rating.Good].minutes);
});

test("the queue has what is due, then a limited number of new marks, oldest first", () => {
  const items = [item("old", { updatedAt: 1 }), item("new", { updatedAt: 5 }), item("mid", { updatedAt: 3 }), item("due"), item("later"),
    item("area", { passage: "" })];
  const states = [
    { ...answer("due", undefined, Rating.Good, now - 3 * DAY), due: now - DAY },
    { ...answer("later", undefined, Rating.Good, now - 3 * DAY), due: now + 5 * DAY },
  ];
  const queue = buildQueue(items, states, now, 2);
  expect(queue.due.map((i) => i.id)).toEqual(["due"]);
  expect(queue.fresh.map((i) => i.id)).toEqual(["old", "mid"]);
  expect(queue.waiting).toBe(2); // "new" waits for tomorrow's share, "later" for its day
  expect(reviewable(items[5])).toBe(false);

  // New marks already started today count against today's share.
  const started = [...states, answer("old", undefined, Rating.Good, now - 60_000)];
  expect(buildQueue(items, started, now, 2).fresh.map((i) => i.id)).toEqual(["mid"]);
  expect(buildQueue(items, started, now, 0).fresh).toEqual([]);
});

test("the review streak counts days in a row up to today or yesterday", () => {
  const d = (back: number) => dayKey(now - back * DAY);
  expect(reviewStreak([], now)).toBe(0);
  expect(reviewStreak([d(0), d(1), d(2), d(4)], now)).toBe(3);
  expect(reviewStreak([d(1), d(2)], now)).toBe(2); // today is not over yet
  expect(reviewStreak([d(2), d(3)], now)).toBe(0);
});
