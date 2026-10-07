// @vitest-environment node
import { expect, test } from "vitest";
import { pixelsPerSecond, SPEED_STEPS } from "../../app/src/reader/autoscroll";
import { filterCommands, type Command } from "../../app/src/reader/CommandPalette";

const command = (title: string): Command => ({ id: title, title, run: () => {} });
const titles = (list: Command[]) => list.map((c) => c.title);

test("finds commands by any of their words, whatever the case or accents", () => {
  const all = ["Search in book", "Go to page", "Fit page", "Layout: Two pages", "Résumé of the book", "قص الهوامش"].map(command);
  expect(titles(filterCommands(all, ""))).toHaveLength(6);
  expect(titles(filterCommands(all, "PAGE"))).toEqual(["Go to page", "Fit page", "Layout: Two pages"]);
  expect(titles(filterCommands(all, "page fit"))).toEqual(["Fit page"]);
  expect(titles(filterCommands(all, "resume"))).toEqual(["Résumé of the book"]);
  expect(titles(filterCommands(all, "الهوامش"))).toEqual(["قص الهوامش"]);
  expect(filterCommands(all, "nothing like this")).toEqual([]);
});

test("a command that starts with the query comes first", () => {
  const all = ["Add sticky note", "Notes and highlights", "Erase highlights and notes"].map(command);
  expect(titles(filterCommands(all, "note"))).toEqual(["Notes and highlights", "Add sticky note", "Erase highlights and notes"]);
});

test("auto-scroll speeds rise step by step from a slow read to a skim", () => {
  const speeds = Array.from({ length: SPEED_STEPS }, (_, i) => pixelsPerSecond(i + 1));
  expect(speeds[0]).toBe(8);
  expect(speeds.at(-1)).toBe(150);
  for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
  expect(pixelsPerSecond(0)).toBe(speeds[0]);
  expect(pixelsPerSecond(99)).toBe(speeds.at(-1));
});
