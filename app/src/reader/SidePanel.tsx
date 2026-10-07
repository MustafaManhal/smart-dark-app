import type { ComponentChildren } from "preact";
import { t } from "../i18n/i18n";
import { IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";

export type PanelSection = "contents" | "pages" | "notes";

const SECTIONS: [PanelSection, string, IconName][] = [
  ["contents", "Contents", "list"],
  ["pages", "Pages", "grid"],
  ["notes", "Notes and highlights", "notes"],
];
// Short names for the tabs; the panel itself carries the full name.
const TAB_LABEL: Record<PanelSection, string> = { contents: "Contents", pages: "Pages", notes: "Notes" };

/**
 * The parts of the open book in one place: its contents, its pages and what
 * the reader marked in it. Beside the pages on wide screens, a tall sheet on phones.
 */
export function SidePanel({ section, onSection, onClose, children }: {
  section: PanelSection; onSection: (section: PanelSection) => void; onClose: () => void; children: ComponentChildren;
}) {
  return (
    <aside class={`notes-panel is-${section}`} aria-label={t(SECTIONS.find(([key]) => key === section)![1])}>
      <header class="side-head">
        <div class="side-tabs" role="tablist" aria-label={t("Parts of the book")}>
          {SECTIONS.map(([key, , icon]) => (
            <button type="button" role="tab" aria-selected={section === key} onClick={() => onSection(key)}>
              <Icon name={icon} size={18} /> {t(TAB_LABEL[key])}
            </button>
          ))}
        </div>
        <IconButton label={t("Close panel")} icon="close" onClick={onClose} />
      </header>
      {children}
    </aside>
  );
}

/** For the translation test: these reach t() through variables. */
export const PANEL_STRINGS = [...SECTIONS.map(([, label]) => label), ...Object.values(TAB_LABEL)];
