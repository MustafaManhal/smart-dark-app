import { effect } from "@preact/signals";
import { route } from "./router";
import { settings } from "./settings";
import { LibraryScreen } from "./library/LibraryScreen";
import { ReaderScreen } from "./reader/ReaderScreen";
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

export function App({ repos }: { repos: Repos }) {
  const r = route.value;
  return r.name === "reader"
    ? <ReaderScreen key={r.bookId} repos={repos} bookId={r.bookId} />
    : <LibraryScreen repos={repos} />;
}
