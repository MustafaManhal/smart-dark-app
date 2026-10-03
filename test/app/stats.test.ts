import { expect, test } from "vitest";
import { bestStreak, currentStreak, dailyTotals, dayKey, goalHitRate, insights, type Goal } from "../../app/src/stats/compute";
import type { Session } from "../../app/src/db/sessions";

const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).getTime();
const s = (start: number, minutes: number, pages: number[], bookId = "b"): Session => ({
  id: `${start}`, bookId, start, end: start + minutes * 60_000, activeMs: minutes * 60_000, pages,
});

const sessions = [
  s(at(2026, 9, 28), 25, [1, 2, 3]),
  s(at(2026, 9, 29), 10, [4]),
  s(at(2026, 9, 30), 40, [5, 6, 7, 8]),
  s(at(2026, 9, 30, 8), 5, [8, 9]), // same day, page 8 again counts once
  s(at(2026, 10, 2), 20, [10, 11]),
];
const today = at(2026, 10, 2, 22);

test("day keys use local dates", () => {
  expect(dayKey(at(2026, 1, 5, 23))).toBe("2026-01-05");
});

test("daily totals add minutes and distinct pages per book", () => {
  const days = dailyTotals(sessions);
  expect(days.get("2026-09-30")).toEqual({ ms: 45 * 60_000, pages: 5 });
  expect(days.get("2026-10-01")).toBeUndefined();
});

test("streaks count days that meet the goal; any reading counts when no goal is set", () => {
  const days = dailyTotals(sessions);
  const none: Goal = { unit: "minutes", value: 0 };
  const twenty: Goal = { unit: "minutes", value: 20 };
  expect(currentStreak(days, none, today)).toBe(1); // Oct 1 had nothing
  expect(bestStreak(days, none)).toBe(3);
  expect(bestStreak(days, twenty)).toBe(1);
  expect(currentStreak(days, twenty, today)).toBe(1);
});

test("today not met yet keeps yesterday's streak alive", () => {
  const days = dailyTotals(sessions.slice(0, 3));
  expect(currentStreak(days, { unit: "pages", value: 1 }, at(2026, 10, 1, 9))).toBe(3);
});

test("goal hit rate over days since reading started", () => {
  const days = dailyTotals(sessions);
  expect(goalHitRate(days, { unit: "minutes", value: 20 }, today)).toBeCloseTo(3 / 5);
  expect(goalHitRate(days, { unit: "minutes", value: 0 }, today)).toBeNull();
});

test("insights: totals, averages and the best time of day", () => {
  const i = insights(sessions, today);
  expect(i.totalMs).toBe(100 * 60_000);
  expect(i.sessionCount).toBe(5);
  expect(i.avgSessionMs).toBe(20 * 60_000);
  expect(i.activeDays).toBe(4);
  expect(i.pagesPerDay).toBeCloseTo(11 / 4);
  expect(i.bestSlot).toBe("evening");
});

test("opening a book for a few seconds is not a reading day", () => {
  const days = dailyTotals([s(at(2026, 10, 2), 0.2, [1])]);
  expect(currentStreak(days, { unit: "minutes", value: 0 }, today)).toBe(0);
});
