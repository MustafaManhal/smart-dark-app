# Plan 4: Goals, streaks, stats, reminders (done)

**Built:**
- Database v4 `sessions` store. `stats/tracker.ts` counts reading time only while the app is visible and
  the reader was used in the last 2 minutes (or read aloud is playing); a 5-minute break starts a new
  session. Sessions are kept when a book is removed and are part of backups.
- `stats/compute.ts`: daily totals (minutes, distinct pages), current and best streak (today may still be
  open), goal hit rate over 30 days, insights (totals, averages, pages per reading day, time of day),
  per-book totals. Without a goal, a reading day needs at least one minute.
- Stats screen (`#/stats`): streak as the one hero number, today's goal meter, insight tiles, last 14 days
  bar chart with goal reference line and table view, 26-week calendar heatmap (one blue ramp, own steps in
  dark mode, tooltip on every cell), per-book table, daily goal sheet (minutes or pages), reminder settings.
- Reminders: a banner in the library after the reminder time when today's goal is not met, plus a system
  notification while the app is open where notifications are allowed. iPhone web apps cannot schedule
  local notifications; there the banner is the reminder.

**Checks:** dataviz palette validator passes for the bar color in light and dark mode.
**Tests:** unit (stats math, tracker with a fake clock) and e2e (seeded history, goal, reminder banner,
real reader time with Playwright's clock), plus the responsive sweep now covers the stats screen.
