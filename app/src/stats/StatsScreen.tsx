import { useEffect, useMemo, useState } from "preact/hooks";
import type { Book, Repos } from "../db/repos";
import type { Session } from "../db/sessions";
import { navigate } from "../router";
import { saveSetting, settings } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { DaysChart, Heatmap } from "./charts";
import { bestStreak, bookTotals, currentStreak, dailyTotals, dayKey, goalHitRate, insights, lastDays } from "./compute";
import { currentGoal } from "./reminders";
import "./stats.css";

const hm = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const SLOT_LABEL = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night" } as const;

export function StatsScreen({ repos }: { repos: Repos }) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [books, setBooks] = useState<Map<string, Book>>(new Map());
  const [goalOpen, setGoalOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const now = Date.now();

  useEffect(() => {
    repos.sessions.all().then(setSessions);
    repos.books.all().then((all) => setBooks(new Map(all.map((b) => [b.id, b]))));
  }, []);

  const goal = currentGoal();
  const days = useMemo(() => dailyTotals(sessions ?? []), [sessions]);
  const today = days.get(dayKey(now)) ?? { ms: 0, pages: 0 };
  const info = useMemo(() => insights(sessions ?? [], now), [sessions]);
  const streak = currentStreak(days, goal, now);
  const best = bestStreak(days, goal);
  const hitRate = goalHitRate(days, goal, now);
  const todayValue = goal.unit === "minutes" ? Math.floor(today.ms / 60_000) : today.pages;
  const pct = goal.value > 0 ? Math.min(1, todayValue / goal.value) : 0;
  const unit = goal.value > 0 ? goal.unit : "minutes";

  return (
    <div class="stats">
      <header class="stats-head">
        <IconButton label="Back to library" icon="back" onClick={() => navigate({ name: "library" })} />
        <h1>Reading stats</h1>
      </header>

      <section class="today-card" aria-label="Today">
        <div class="streak">
          <span class="hero">{streak}</span>
          <span class="streak-label">{streak === 1 ? "day streak" : "day streak"}</span>
          <span class="muted">Best {best}</span>
        </div>
        <div class="goal">
          {goal.value > 0 ? (
            <>
              <div class="goal-text">
                <strong>{todayValue} / {goal.value} {goal.unit === "minutes" ? "min" : "pages"}</strong>
                <span class="muted">{pct >= 1 ? "Goal reached today" : "Today's goal"}</span>
              </div>
              <div class="meter" role="progressbar" aria-label="Today's goal" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${pct * 100}%` }} />
              </div>
            </>
          ) : (
            <div class="goal-text">
              <strong>{hm(today.ms)} today</strong>
              <span class="muted">Set a daily goal to build a streak around it.</span>
            </div>
          )}
          <Button onClick={() => setGoalOpen(true)}>{goal.value > 0 ? "Change daily goal" : "Set daily goal"}</Button>
        </div>
      </section>

      <section class="tiles" aria-label="Insights">
        <div class="tile"><span class="tile-label">Total reading</span><span class="tile-value">{hm(info.totalMs)}</span></div>
        <div class="tile"><span class="tile-label">Sessions</span><span class="tile-value">{info.sessionCount}</span></div>
        <div class="tile"><span class="tile-label">Average session</span><span class="tile-value">{hm(info.avgSessionMs)}</span></div>
        <div class="tile"><span class="tile-label">Pages per reading day</span><span class="tile-value">{info.pagesPerDay.toFixed(1)}</span></div>
        <div class="tile"><span class="tile-label">Goal met, last 30 days</span><span class="tile-value">{hitRate === null ? "–" : `${Math.round(hitRate * 100)}%`}</span></div>
        <div class="tile"><span class="tile-label">You read most</span><span class="tile-value">{info.bestSlot ? SLOT_LABEL[info.bestSlot] : "–"}</span></div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>Last 14 days</h2>
          <button type="button" class="link" onClick={() => setShowTable((v) => !v)}>{showTable ? "Show chart" : "Show as table"}</button>
        </div>
        {showTable ? (
          <table class="data-table">
            <thead><tr><th>Day</th><th>Minutes</th><th>Pages</th></tr></thead>
            <tbody>
              {lastDays(days, now, 14).reverse().map((d) => (
                <tr><td>{new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</td>
                  <td>{Math.round(d.ms / 60_000)}</td><td>{d.pages}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <DaysChart days={days} goal={goal} unit={unit} now={now} />
        )}
      </section>

      <section class="card">
        <h2>Activity</h2>
        <Heatmap days={days} unit={unit} now={now} />
      </section>

      <section class="card">
        <h2>Books</h2>
        {sessions && !sessions.length && <p class="muted">Your reading time shows up here after you read for a little while.</p>}
        <table class="data-table">
          <thead><tr><th>Book</th><th>Time</th><th>Sessions</th><th>Pages</th></tr></thead>
          <tbody>
            {bookTotals(sessions ?? []).map((b) => (
              <tr><td>{books.get(b.bookId)?.title ?? "Removed book"}</td><td>{hm(b.ms)}</td><td>{b.sessions}</td><td>{b.pages}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="card">
        <h2>Reminder</h2>
        <label class="toggle">
          <input type="checkbox" checked={settings.reminderOn.value} onChange={async (e) => {
            const on = e.currentTarget.checked;
            if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
              await Notification.requestPermission().catch(() => "denied");
            }
            saveSetting("reminderOn", on);
          }} />
          Remind me to read every day
        </label>
        {settings.reminderOn.value && (
          <label class="field reminder-time">
            <span>Time</span>
            <input type="time" value={settings.reminderTime.value} onChange={(e) => saveSetting("reminderTime", e.currentTarget.value || "19:00")} />
          </label>
        )}
        <p class="muted small">
          {typeof Notification === "undefined" || Notification.permission !== "granted"
            ? "The reminder shows in your library when you open the app. System notifications need notification permission."
            : "You will get a notification while the app is open, and a reminder in your library."}
        </p>
      </section>

      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} />
    </div>
  );
}

function GoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [unit, setUnit] = useState(settings.goalUnit.value);
  const [value, setValue] = useState(settings.goalValue.value || 20);
  useEffect(() => {
    if (open) {
      setUnit(settings.goalUnit.value);
      setValue(settings.goalValue.value || (settings.goalUnit.value === "minutes" ? 20 : 10));
    }
  }, [open]);
  const step = unit === "minutes" ? 5 : 1;
  return (
    <Sheet open={open} title="Daily goal" onClose={onClose}>
      <fieldset class="seg">
        <legend>Measure by</legend>
        <label><input type="radio" name="goalUnit" checked={unit === "minutes"} onChange={() => { setUnit("minutes"); setValue(20); }} />Minutes</label>
        <label><input type="radio" name="goalUnit" checked={unit === "pages"} onChange={() => { setUnit("pages"); setValue(10); }} />Pages</label>
      </fieldset>
      <div class="stepper">
        <IconButton label="Less" icon="minus" onClick={() => setValue((v) => Math.max(step, v - step))} />
        <output aria-live="polite">{value} {unit === "minutes" ? "min" : "pages"} a day</output>
        <IconButton label="More" icon="plus" onClick={() => setValue((v) => Math.min(unit === "minutes" ? 600 : 500, v + step))} />
      </div>
      <div class="sheet-actions">
        <Button variant="danger" onClick={() => { saveSetting("goalValue", 0); onClose(); }}>No goal</Button>
        <Button variant="primary" onClick={() => { saveSetting("goalUnit", unit); saveSetting("goalValue", value); onClose(); }}>Save goal</Button>
      </div>
    </Sheet>
  );
}
