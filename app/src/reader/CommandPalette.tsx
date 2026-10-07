import { useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { Icon, type IconName } from "../ui/Icon";
import { fold } from "./search";

export type Command = {
  id: string;
  title: string;
  /** A second line, such as the page of a chapter. */
  hint?: string;
  /** The keys that do the same, as shown to the reader. */
  keys?: string;
  icon?: IconName;
  run: () => void;
};

/** Commands whose title has every word of the query, the ones that start with it first. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = fold(query).folded.trim().split(" ").filter(Boolean);
  if (!words.length) return commands;
  const scored: { command: Command; score: number }[] = [];
  for (const command of commands) {
    const title = fold(command.title).folded;
    if (!words.every((w) => title.includes(w))) continue;
    scored.push({ command, score: title.startsWith(words[0]) ? 0 : title.includes(` ${words[0]}`) ? 1 : 2 });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.command);
}

/**
 * Every action of the reader in one searchable list (Ctrl/Cmd+K). A number
 * goes to that page.
 */
export function CommandPalette({ commands, pages, onGoToPage, onClose }: {
  commands: Command[]; pages: number; onGoToPage: (page: number) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // Typing goes to the list from the moment it is on screen (autofocus alone waits for the next frame).
  useLayoutEffect(() => field.current?.focus(), []);

  const shown = useMemo(() => {
    const found = filterCommands(commands, query);
    const number = /^\s*\d+\s*$/.test(query) ? Number(query) : 0;
    if (number >= 1 && number <= pages) {
      found.unshift({ id: "page", title: t("Go to page {n}", { n: number }), icon: "chevronRight", run: () => onGoToPage(number) });
    }
    return found;
  }, [commands, query, pages]);

  useLayoutEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, shown]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(shown[active]); }
  };

  return (
    <div class="palette-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="palette" role="dialog" aria-modal="true" aria-label={t("Commands")}>
        <div class="palette-field">
          <Icon name="search" size={18} />
          <input ref={field} type="text" autocomplete="off" autocapitalize="off" spellcheck={false} role="combobox"
            aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[active] ? `cmd-${shown[active].id}` : undefined}
            aria-label={t("Type a command or a page number")} placeholder={t("Type a command or a page number")}
            value={query} onInput={(e) => { setQuery(e.currentTarget.value); setActive(0); }} onKeyDown={onKey} />
        </div>
        <ul class="palette-list" id="palette-list" role="listbox" ref={list} aria-label={t("Commands")}>
          {shown.map((command, i) => (
            <li id={`cmd-${command.id}`} role="option" aria-selected={i === active} class={i === active ? "is-active" : ""}
              onPointerMove={() => setActive(i)} onClick={() => run(command)}>
              <span class="palette-icon">{command.icon && <Icon name={command.icon} size={18} />}</span>
              <span class="palette-title">{command.title}{command.hint && <small>{command.hint}</small>}</span>
              {command.keys && <kbd dir="ltr">{command.keys}</kbd>}
            </li>
          ))}
          {!shown.length && <li class="palette-empty" role="presentation">{t("No command found")}</li>}
        </ul>
      </section>
    </div>
  );
}
