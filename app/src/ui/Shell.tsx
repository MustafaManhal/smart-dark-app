import { signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { BackupSheet } from "../backup/BackupSheet";
import type { Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { navigate, type Route } from "../router";
import { Brand } from "./Brand";
import { Icon, type IconName } from "./Icon";
import { useMedia } from "./useMedia";
import "./shell.css";

/** Counts restores of a backup made from the shell: the library reads its books again when it changes. */
export const restored = signal(0);

type Place = Exclude<Route["name"], "reader" | "review">;
/** The places of the app: route, name, icon, and a shorter name for the tab bar of a phone. */
const PLACES: [Place, string, IconName, string][] = [
  ["library", "Library", "book", "Library"],
  ["notebook", "Notebook", "notes", "Notebook"],
  ["tools", "PDF tools", "pages", "PDF tools"],
  ["stats", "Reading stats", "chart", "Stats"],
  ["settings", "Settings", "settings", "Settings"],
];

/**
 * The frame around every screen except the readers: the places of the app, each with its name, always on
 * screen. A sidebar on wide screens, a bar of tabs at the bottom on phones. Hidden navigation is found
 * about half as often as visible navigation (docs/plans/2026-10-07-open-desk-redesign.md).
 */
export function Shell({ repos, current, children }: { repos: Repos; current: Route["name"]; children: ComponentChildren }) {
  const wide = useMedia("(min-width: 900px)");
  const [backup, setBackup] = useState(false);
  // The review belongs to the notebook: it is started from there.
  const here = current === "review" ? "notebook" : current;
  return (
    <div class="shell">
      <nav class="shell-nav" aria-label={t("Places")}>
        {wide && <div class="shell-brand"><Brand size={26} /></div>}
        {PLACES.map(([name, label, icon, short]) => (
          <button type="button" class="nav-item" aria-label={t(label)} aria-current={here === name ? "page" : undefined}
            onClick={() => navigate({ name })}>
            <Icon name={icon} size={wide ? 20 : 22} />
            <span>{t(wide ? label : short)}</span>
          </button>
        ))}
        {wide && (
          <>
            <span class="nav-gap" />
            <button type="button" class="nav-item" aria-label={t("Back up and restore")} onClick={() => setBackup(true)}>
              <Icon name="backup" size={20} />
              <span>{t("Back up and restore")}</span>
            </button>
            <p class="nav-note">{t("Your books and notes stay on this device.")}</p>
          </>
        )}
      </nav>
      <main class="shell-main">{children}</main>
      {wide && <BackupSheet repos={repos} open={backup} onClose={() => setBackup(false)} onRestored={() => { restored.value++; }} />}
    </div>
  );
}
