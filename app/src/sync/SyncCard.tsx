import type { Repos } from "../db/repos";
import { locale, t } from "../i18n/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { chooseSyncFolder, stopSync, syncNow, syncStatus, syncSupported } from "./sync";

/** The settings card for sync through a folder the person chooses. */
export function SyncCard({ repos }: { repos: Repos }) {
  const { folder, state, last } = syncStatus.value;
  const brought = last ? [
    last.booksAdded > 0 && (last.booksAdded === 1 ? t("1 book received.") : t("{n} books received.", { n: last.booksAdded })),
    last.received > 0 && (last.received === 1 ? t("1 mark received.") : t("{n} marks received.", { n: last.received })),
    last.removed > 0 && t("{n} removed here, as on another computer.", { n: last.removed }),
    last.booksSent > 0 && (last.booksSent === 1 ? t("1 book put in the folder.") : t("{n} books put in the folder.", { n: last.booksSent })),
    last.waiting > 0 && (last.waiting === 1 ? t("1 book is still on its way to this folder.") : t("{n} books are still on their way to this folder.", { n: last.waiting })),
    last.devices === 0 && t("No other computer has used this folder yet."),
  ].filter(Boolean).join(" ") : "";

  return (
    <section class="card" id="set-sync">
      <h2>{t("Sync between your computers")}</h2>
      {!syncSupported() ? (
        <p class="muted">{t("Folder sync needs Chrome or Edge on a computer, or the desktop app. On this device, move your library with Back up and restore.")}</p>
      ) : !folder ? (
        <>
          <p class="muted">{t("Choose a folder that your computers share, for example inside iCloud Drive, Dropbox or OneDrive. Your books, marks and reading places are kept there, and every computer that uses the same folder gets them.")}</p>
          <p class="muted small">{t("The app sends nothing itself: the folder's own service carries the files. Passwords of protected books stay on each computer.")}</p>
          <Button onClick={() => chooseSyncFolder(repos)}><Icon name="upload" size={18} /> {t("Choose a folder")}</Button>
        </>
      ) : (
        <>
          <p class="sync-folder">{t("Folder:")} <strong dir="auto">{folder}</strong></p>
          <p class="muted small" role="status">
            {state === "syncing" ? t("Syncing…")
              : state === "needs-permission" ? t("The browser needs your OK to use the folder again.")
              : state === "failed" ? t("The folder could not be read or written. Check that it is still there.")
              : last ? `${t("Last synced {when}.", { when: new Date(last.at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) })} ${brought}`
              : t("Not synced yet.")}
          </p>
          <div class="sync-actions">
            <Button variant="primary" disabled={state === "syncing"} onClick={() => syncNow(repos, { ask: true })}>
              {t(state === "needs-permission" ? "Allow" : "Sync now")}
            </Button>
            <Button disabled={state === "syncing"} onClick={() => stopSync(repos)}>{t("Stop syncing")}</Button>
          </div>
          <p class="muted small">{t("Sync runs when the library opens and when you ask for it. Stopping leaves the files in the folder.")}</p>
        </>
      )}
    </section>
  );
}
