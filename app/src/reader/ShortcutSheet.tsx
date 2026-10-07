import { t } from "../i18n/i18n";
import { Sheet } from "../ui/Sheet";

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** "Mod+K" as this computer shows it: ⌘K on a Mac, Ctrl+K elsewhere. */
export const keys = (combo: string) => (MAC
  ? combo.replace(/Mod\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧")
  : combo.replace(/Mod\+/g, "Ctrl+"));

const GROUPS: [string, [string, string][]][] = [
  ["Moving", [
    ["→  /  J", "Next page"], ["←  /  K", "Previous page"], ["Home", "First page"], ["End", "Last page"],
    ["G", "Go to page"], ["Alt+←", "Back to where you were"], ["A", "Auto-scroll"],
  ]],
  ["Finding", [["Mod+F", "Search in book"], ["Mod+K", "Find a command"], ["?", "Keyboard shortcuts"]]],
  ["Marking", [
    ["B", "Bookmark this page"], ["Mod+Z", "Undo"], ["Mod+Shift+Z", "Redo"], ["Delete", "Remove the open highlight"], ["Esc", "Close or cancel"],
  ]],
  ["Looking", [["Mod++", "Zoom in"], ["Mod+-", "Zoom out"], ["Mod+0", "Fit width"], ["R", "Rotate right"], ["Shift+R", "Rotate left"], ["F", "Focus: only the book"]]],
];

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title={t("Keyboard shortcuts")} onClose={onClose}>
      <div class="shortcuts">
        {GROUPS.map(([group, rows]) => (
          <section>
            <h3>{t(group)}</h3>
            <dl>
              {rows.map(([combo, what]) => (
                <div><dt><kbd dir="ltr">{keys(combo)}</kbd></dt><dd>{t(what)}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

/** For the translation test: the strings above reach t() through variables. */
export const SHORTCUT_STRINGS = GROUPS.flatMap(([group, rows]) => [group, ...rows.map(([, what]) => what)]);
