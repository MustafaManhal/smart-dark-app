import { effect } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { route, type Route } from "./router";
import { EbookScreen } from "./ebook/EbookScreen";
import { Shell } from "./ui/Shell";
import { settings } from "./settings";
import { dir, lang } from "./i18n/i18n";
import { SettingsScreen } from "./settings/SettingsScreen";
import { NotebookScreen } from "./notebook/NotebookScreen";
import { ReviewScreen } from "./review/ReviewScreen";
import { ToolsScreen } from "./tools/ToolsScreen";
import { LibraryScreen } from "./library/LibraryScreen";
import { ReaderScreen } from "./reader/ReaderScreen";
import { StatsScreen } from "./stats/StatsScreen";
import { startReminders } from "./stats/reminders";
import { isEbook, type Book, type Repos } from "./db/repos";

// Follow the system theme unless the user picked one.
const media = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pick = settings.appTheme.value;
  const dark = pick === "dark" || (pick === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
effect(applyTheme);
effect(() => {
  document.documentElement.dataset.density = settings.density.value;
});
// Language and reading direction for the whole document (Arabic is right to left).
effect(() => {
  document.documentElement.lang = lang.value;
  document.documentElement.dir = dir.value;
});
media.addEventListener("change", applyTheme);

/** A book opens in the reader made for its kind: the PDF reader, or the e-book reader for EPUB and the like. */
function BookGate({ repos, route: r }: { repos: Repos; route: Extract<Route, { name: "reader" }> }) {
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  useEffect(() => {
    repos.books.get(r.bookId).then((found) => setBook(found ?? null));
  }, []);
  if (book === undefined) return null;
  if (book && isEbook(book)) return <EbookScreen repos={repos} book={book} startPage={r.page} />;
  return <ReaderScreen repos={repos} bookId={r.bookId} startPage={r.page} startFind={r.find} tour={r.tour} />;
}

let remindersStarted = false;

export function App({ repos }: { repos: Repos }) {
  if (!remindersStarted) {
    remindersStarted = true;
    startReminders(repos);
  }
  const r = route.value;
  if (r.name === "reader") return <BookGate key={`${r.bookId}-${r.page ?? ""}-${r.find ?? ""}`} repos={repos} route={r} />;
  // Every screen but the readers sits in the shell, which keeps the places of the app on screen.
  const screen = r.name === "stats" ? <StatsScreen repos={repos} />
    : r.name === "settings" ? <SettingsScreen repos={repos} />
    : r.name === "notebook" ? <NotebookScreen repos={repos} />
    : r.name === "review" ? <ReviewScreen repos={repos} />
    : r.name === "tools" ? <ToolsScreen key={r.bookId ?? ""} repos={repos} bookId={r.bookId} />
    : <LibraryScreen repos={repos} />;
  return <Shell repos={repos} current={r.name}>{screen}</Shell>;
}
