import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

/** Writes reading sessions straight into the app's database (it must be open already). */
async function seedSessions(page: Page, sessions: { daysAgo: number; minutes: number; pages: number[] }[]) {
  await page.evaluate(async (list) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("smart-dark-reader");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction("sessions", "readwrite");
    list.forEach((s, i) => {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - s.daysAgo, 0, 5).getTime();
      tx.objectStore("sessions").put({ id: `seed-${i}`, bookId: "gone", start, end: start + s.minutes * 60_000, activeMs: s.minutes * 60_000, pages: s.pages });
    });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  }, sessions);
}

test("stats show streak, goal progress, charts and a table", async ({ page }) => {
  await page.goto("./");
  await seedSessions(page, [
    { daysAgo: 0, minutes: 25, pages: [1, 2, 3] },
    { daysAgo: 1, minutes: 30, pages: [4, 5] },
    { daysAgo: 2, minutes: 10, pages: [6] },
  ]);
  await page.getByRole("button", { name: "Reading stats" }).click();
  await expect(page.getByRole("heading", { name: "Reading stats" })).toBeVisible();
  await expect(page.locator(".hero")).toHaveText("3"); // no goal: any reading counts

  await page.getByRole("button", { name: "Set daily goal" }).click();
  const sheet = page.getByRole("dialog", { name: "Daily goal" });
  await expect(sheet.locator("output")).toHaveText("20 min a day");
  await sheet.getByRole("button", { name: "Save goal" }).click();
  await expect(page.locator(".hero")).toHaveText("2"); // the 10-minute day breaks it
  await expect(page.getByRole("progressbar", { name: "Today's goal" })).toHaveAttribute("aria-valuenow", "100");
  await expect(page.getByText("Goal reached today")).toBeVisible();
  await expect(page.locator(".goal-line")).toContainText("Goal 20 min");
  await expect(page.getByRole("button", { name: /: 25 min$/ }).first()).toBeVisible();
  await expect(page.getByRole("grid", { name: /Reading per day/ })).toBeVisible();
  await page.screenshot({ path: `test/output/stats-${test.info().project.name}.png`, fullPage: true });

  await page.getByRole("button", { name: "Show as table" }).click();
  await expect(page.locator(".data-table").first().locator("tbody tr").first()).toContainText("25");
  await expect(page.getByRole("cell", { name: "Removed book" })).toBeVisible();
});

test("reminder banner in the library when today's goal is not met", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Reading stats" }).click();
  await page.getByRole("button", { name: "Set daily goal" }).click();
  await page.getByRole("dialog", { name: "Daily goal" }).getByRole("button", { name: "Save goal" }).click();
  await page.getByLabel("Remind me to read every day").check();
  await page.getByLabel("Time").fill("00:00");
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Time to read: 20 min left for today's goal." })).toBeVisible();
});

test("time spent in the reader is counted", async ({ page }) => {
  await page.clock.install(); // time keeps flowing; runFor() then jumps ahead and fires timers
  await openSample(page);
  for (let i = 0; i < 8; i++) {
    await page.locator(".reader-scroll").dispatchEvent("pointerdown");
    await page.clock.runFor(10_000);
  }
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Reading stats" }).click();
  await expect(page.getByRole("row", { name: /Reader343 sample/ })).toContainText("1 min");
});
