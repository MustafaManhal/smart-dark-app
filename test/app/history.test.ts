import { expect, test } from "vitest";
import { History } from "../../app/src/annotations/history";

test("undo takes steps back in reverse order and redo does them again", async () => {
  const log: string[] = [];
  const h = new History();
  expect(h.canUndo).toBe(false);
  expect(await h.undo()).toBe(false);
  h.push({ undo: () => log.push("undo a"), redo: () => log.push("redo a") });
  h.push({ undo: () => log.push("undo b"), redo: () => log.push("redo b") });
  expect(await h.undo()).toBe(true);
  expect(await h.undo()).toBe(true);
  expect(h.canUndo).toBe(false);
  expect(h.canRedo).toBe(true);
  expect(await h.redo()).toBe(true);
  expect(log).toEqual(["undo b", "undo a", "redo a"]);
  expect(await h.undo()).toBe(true);
  expect(log.at(-1)).toBe("undo a");
});

test("a new step after an undo drops what could be redone", async () => {
  const h = new History();
  h.push({ undo: () => {}, redo: () => {} });
  await h.undo();
  expect(h.canRedo).toBe(true);
  h.push({ undo: () => {}, redo: () => {} });
  expect(h.canRedo).toBe(false);
  expect(await h.redo()).toBe(false);
});

test("typing in the same note is one step: undo goes back to before the first change", async () => {
  let time = 0;
  let text = "";
  const h = new History(() => {}, () => time);
  const type = (to: string) => {
    const from = text;
    text = to;
    h.push({ mergeKey: "sticky:1", undo: () => (text = from), redo: () => (text = to) });
  };
  type("H");
  time += 500;
  type("He");
  time += 500;
  type("Hello");
  await h.undo();
  expect(text).toBe("");
  expect(h.canUndo).toBe(false);
  await h.redo();
  expect(text).toBe("Hello");
  // After a pause, or on another note, it is a new step.
  time += 10_000;
  type("Hello!");
  await h.undo();
  expect(text).toBe("Hello");
});

test("the history tells its owner when it changes, and keeps the last 100 steps", async () => {
  let changes = 0;
  const h = new History(() => changes++);
  for (let i = 0; i < 120; i++) h.push({ undo: () => {}, redo: () => {} });
  let undone = 0;
  while (await h.undo()) undone++;
  expect(undone).toBe(100);
  expect(changes).toBe(220);
});
