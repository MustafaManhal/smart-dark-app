// @vitest-environment node
import { expect, test } from "vitest";
import type { Session } from "../../app/src/db/sessions";
import { ReadingTracker } from "../../app/src/stats/tracker";

function setup() {
  let now = 1_000_000;
  const saved = new Map<string, Session>();
  const repo = { save: async (s: Session) => void saved.set(s.id, structuredClone(s)) };
  const t = new ReadingTracker(repo, "book", { now: () => now, idleMs: 120_000, gapMs: 300_000, maxStepMs: 10_000 });
  const advance = (ms: number, step = 5_000) => {
    for (let left = ms; left > 0; left -= step) { now += Math.min(step, left); t.tick(); }
  };
  return { t, saved, advance, setNow: (v: number) => (now = v), get now() { return now; } };
}

test("counts active time and the pages seen", async () => {
  const { t, saved, advance } = setup();
  t.setPage(1); t.activity();
  advance(30_000);
  t.setPage(2); t.activity();
  advance(30_000);
  await t.flush();
  const [s] = [...saved.values()];
  expect(s.activeMs).toBe(60_000);
  expect(s.pages).toEqual([1, 2]);
});

test("stops counting after two idle minutes, unless reading aloud", async () => {
  const { t, saved, advance } = setup();
  t.setPage(1); t.activity();
  advance(300_000); // 5 minutes without touching anything
  await t.flush();
  expect([...saved.values()][0].activeMs).toBe(120_000);

  t.setPlaying(true);
  advance(60_000);
  await t.flush();
  const total = [...saved.values()].reduce((a, s) => a + s.activeMs, 0);
  expect(total).toBe(180_000);
});

test("hidden app time is not counted and a long gap starts a new session", async () => {
  const { t, saved, advance, setNow } = setup();
  t.setPage(1); t.activity();
  advance(20_000);
  t.setVisible(false);
  advance(60_000);
  t.setVisible(true);
  setNow(setup().now + 3_600_000); // an hour later
  t.activity();
  advance(10_000);
  await t.flush();
  const sessions = [...saved.values()].sort((a, b) => a.start - b.start);
  expect(sessions).toHaveLength(2);
  expect(sessions[0].activeMs).toBe(20_000);
  expect(sessions[1].activeMs).toBe(10_000);
});
