import { effect } from "@preact/signals";
import { route } from "./router";
import { settings } from "./settings";
import { LibraryScreen } from "./library/LibraryScreen";
import { ReaderScreen } from "./reader/ReaderScreen";
import { StatsScreen } from "./stats/StatsScreen";
import { startReminders } from "./stats/reminders";
import type { Repos } from "./db/repos";

// Follow the system theme unless the user picked one.
const media = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pick = settings.appTheme.value;
  const dark = pick === "dark" || (pick === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
effect(applyTheme);
media.addEventListener("change", applyTheme);

let remindersStarted = false;

export function App({ repos }: { repos: Repos }) {
  if (!remindersStarted) {
    remindersStarted = true;
    startReminders(repos);
  }
  const r = route.value;
  if (r.name === "reader") return <ReaderScreen key={`${r.bookId}-${r.page ?? ""}`} repos={repos} bookId={r.bookId} startPage={r.page} />;
  if (r.name === "stats") return <StatsScreen repos={repos} />;
  return <LibraryScreen repos={repos} />;
}
