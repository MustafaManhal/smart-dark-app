import { desktop } from "../platform/desktop";
import { checkUpdates, installUpdate, updateState } from "../platform/update";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { Button } from "../ui/Button";

/** What the update line says, for the settings card and the library's notice alike. */
export function UpdateLine() {
  const now = updateState.value;
  if (now.step === "idle" || now.step === "checking") return null;
  if (now.step === "failed") return <p class="muted small" role="status">{t("Could not check for updates. Try again later.")}</p>;
  if (now.step === "downloading") {
    return <p class="muted small" role="status">{t("Downloading version {v}: {n}%", { v: now.latest.replace(/^v/, ""), n: now.percent })}</p>;
  }
  if (now.step === "opened") {
    return <p class="muted small" role="status">{t(desktop?.platform === "darwin"
      ? "The new version is open. Drag Reader343 to Applications to replace this one. The app closes now."
      : desktop?.platform === "linux" ? "The new version is in the folder that opened. Start it in place of this one."
      : "The installer is opening. The app closes now.")}</p>;
  }
  const result = now.result;
  if (result.status === "off") return <p class="muted small" role="status">{t("Update checks are not set up for this build.")}</p>;
  if (result.status === "current") return <p class="muted small" role="status">{t("You have the latest version ({v}).", { v: result.current })}</p>;
  return (
    <p class="muted small" role="status">
      {t("Version {v} is available.", { v: result.latest.replace(/^v/, "") })}{" "}
      {now.step === "install-failed" && t("It could not be downloaded. Try again, or get it from the download page.")}{" "}
      {!result.canInstall && <button type="button" class="link" onClick={() => desktop!.openExternal(result.url)}>{t("Download")}</button>}
    </p>
  );
}

/** True when a newer version was found and its installer can be fetched from here. */
export const updateReady = () => {
  const now = updateState.value;
  return (now.step === "result" || now.step === "install-failed") && now.result.status === "available" && !!now.result.canInstall;
};

export function UpdateCard() {
  const now = updateState.value;
  const busy = now.step === "checking" || now.step === "downloading";
  return (
    <section class="card" id="set-updates">
      <h2>{t("Updates")}</h2>
      <label class="toggle">
        <input type="checkbox" checked={settings.updateAuto.value} onChange={(e) => saveSetting("updateAuto", e.currentTarget.checked)} />
        {t("Check when the app starts")}
      </label>
      <p class="toggle-note">{t("Once a day the app asks GitHub for the number of the newest version. Nothing about you or your books is sent.")}</p>
      <div class="sync-actions">
        <Button onClick={checkUpdates} disabled={busy}>{t("Check for updates")}</Button>
        {updateReady() && <Button variant="primary" onClick={installUpdate}>{t("Update now")}</Button>}
      </div>
      <UpdateLine />
    </section>
  );
}
