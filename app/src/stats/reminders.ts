import { t } from "../i18n/i18n";
import { effect } from "@preact/signals";
import type { Repos } from "../db/repos";
import { settings } from "../settings";
import { dailyTotals, dayKey, goalMet, type Goal } from "./compute";

export const currentGoal = (): Goal => ({ unit: settings.goalUnit.value, value: settings.goalValue.value });

/** Today's reminder time as a timestamp ("19:00" -> today 19:00 local). */
export function reminderAt(now: number, time: string): number {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0).getTime();
}

/** The reminder text if it is due now (after the reminder time, goal not met today), else null. */
export async function dueReminder(repos: Repos, now = Date.now()): Promise<string | null> {
  if (!settings.reminderOn.value || now < reminderAt(now, settings.reminderTime.value)) return null;
  const goal = currentGoal();
  const today = dailyTotals(await repos.sessions.all()).get(dayKey(now));
  if (goalMet(today, goal)) return null;
  if (goal.value <= 0) return t("You have not read today yet.");
  const done = goal.unit === "minutes" ? Math.floor((today?.ms ?? 0) / 60_000) : today?.pages ?? 0;
  const left = goal.value - done;
  if (goal.unit === "minutes") return t("{n} min left for today's goal.", { n: left });
  return t(left === 1 ? "1 page left for today's goal." : "{n} pages left for today's goal.", { n: left });
}

/**
 * System notifications while the app is open (desktop browsers and the
 * desktop app). iPhone web apps cannot schedule local notifications, so there
 * the reminder shows as a banner in the library instead.
 */
export function startReminders(repos: Repos) {
  let timer = 0;
  effect(() => {
    const on = settings.reminderOn.value;
    const time = settings.reminderTime.value;
    clearTimeout(timer);
    if (!on || typeof Notification === "undefined") return;
    const schedule = () => {
      const now = Date.now();
      let at = reminderAt(now, time);
      if (at <= now) at += 86_400_000;
      timer = window.setTimeout(async () => {
        const text = await dueReminder(repos);
        if (text && Notification.permission === "granted") new Notification(t("Time to read"), { body: text, tag: "daily-reading" });
        schedule();
      }, Math.min(at - now, 2_147_000_000));
    };
    schedule();
  });
}
