import { useState } from "preact/hooks";
import { BackupSheet } from "../backup/BackupSheet";
import type { Repos } from "../db/repos";
import { lang, t } from "../i18n/i18n";
import { navigate } from "../router";
import { desktop, type UpdateResult } from "../platform/desktop";
import { refreshStorageInfo, storageInfo } from "../platform/pwa";
import { useEffect } from "preact/hooks";
import { saveSetting, settings, type AppTheme, type DarkTheme, type ImageMode, type PageStyle } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AdjustControls } from "../reader/AdjustControls";
import { SpeedStepper } from "../readaloud/VoicePicker";
import { Brand } from "../ui/Brand";
import { pageColors, Swatch, themeColors } from "../reader/Swatch";
import "./settings.css";

function Choice<T extends string | number>({ name, legend, value, options, onPick, colors }: {
  name: string; legend: string; value: T; options: [T, string][]; onPick: (v: T) => void;
  /** The paper and ink an option gives, drawn as a tiny page inside it. */
  colors?: (v: T) => { paper: string; ink: string };
}) {
  return (
    <fieldset class="seg">
      <legend>{legend}</legend>
      {options.map(([v, label]) => (
        <label><input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />{colors && <Swatch {...colors(v)} />}{label}</label>
      ))}
    </fieldset>
  );
}

const SECTIONS: [string, string][] = [
  ["appearance", "Appearance"], ["language", "Language"], ["read-aloud", "Read aloud"], ["goals", "Goals and reminders"],
  ["book-details", "Book details"], ["your-data", "Your data"], ["about", "About"],
];

export function SettingsScreen({ repos }: { repos: Repos }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateResult | "checking" | "error" | null>(null);
  useEffect(() => {
    refreshStorageInfo();
  }, []);
  const mb = (b: number) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);
  const s = settings;
  return (
    <div class="settings">
      <header class="settings-head">
        <IconButton label={t("Back to library")} icon="back" onClick={() => navigate({ name: "library" })} />
        <h1>{t("Settings")}</h1>
      </header>
      {/* On wide screens: the sections as a list beside them. */}
      <nav class="settings-nav" aria-label={t("Sections")}>
        {SECTIONS.map(([id, label]) => (
          <button type="button" onClick={() => document.getElementById(`set-${id}`)?.scrollIntoView({ block: "start", behavior: "auto" })}>{t(label)}</button>
        ))}
      </nav>

      <section class="card" id="set-appearance">
        <h2>{t("Appearance")}</h2>
        <Choice<AppTheme> name="appTheme" legend={t("App theme")} value={s.appTheme.value}
          options={[["system", t("Match device")], ["light", t("Light")], ["dark", t("Dark")]]}
          onPick={(v) => saveSetting("appTheme", v)} />
        <Choice<"comfortable" | "compact"> name="density" legend={t("Spacing")} value={s.density.value}
          options={[["comfortable", t("Comfortable")], ["compact", t("Compact")]]}
          onPick={(v) => saveSetting("density", v)} />
        <Choice<PageStyle> name="pageStyle" legend={t("Pages")} value={s.pageStyle.value}
          options={[["original", t("Original")], ["sepia", t("Sepia")], ["dark", t("Smart dark")]]}
          onPick={(v) => saveSetting("pageStyle", v)} colors={(v) => pageColors(v, s.darkTheme.value)} />
        {s.pageStyle.value === "dark" && (
          <>
            <Choice<DarkTheme> name="darkTheme" legend={t("Dark theme")} value={s.darkTheme.value}
              options={[["dark", t("Dark")], ["dim", t("Dim")], ["black", t("Black")], ["warm", t("Warm")], ["slate", t("Slate")]]}
              onPick={(v) => saveSetting("darkTheme", v)} colors={themeColors} />
            <Choice<ImageMode> name="imageMode" legend={t("Images")} value={s.imageMode.value}
              options={[["smart", t("Smart")], ["keep", t("Keep")], ["dim", t("Dim")], ["invert", t("Darken")]]}
              onPick={(v) => saveSetting("imageMode", v)} />
            <p class="muted small">{t("Smart keeps photos in their real colors and darkens scanned pages.")}</p>
          </>
        )}
        <AdjustControls />
        <p class="muted small">{t("Brightness changes the text only. Contrast, sepia and grayscale change the whole page. Photos keep their colors.")}</p>
      </section>

      <section class="card" id="set-language">
        <h2>{t("Language")}</h2>
        <Choice name="language" legend={t("App language")} value={s.language.value}
          options={[["system", t("Match device")], ["en", "English"], ["ar", "العربية"]]}
          onPick={(v) => saveSetting("language", v)} />
      </section>

      <section class="card" id="set-read-aloud">
        <h2>{t("Read aloud")}</h2>
        <div class="read-speed-row">
          <span>{t("Speed")}</span>
          <SpeedStepper />
        </div>
        <label class="toggle">
          <input type="checkbox" checked={s.readSmart.value} onChange={(e) => saveSetting("readSmart", e.currentTarget.checked)} />
          {t("Smart reading: skip page numbers, headers, links and footnote marks")}
        </label>
        <p class="muted small">{t("Voices are chosen in the reader: open read aloud, then its settings.")}</p>
        <label class="toggle">
          <input type="checkbox" checked={s.readAutoPage.value} onChange={(e) => saveSetting("readAutoPage", e.currentTarget.checked)} />
          {t("Continue to the next page")}
        </label>
      </section>

      <section class="card" id="set-goals">
        <h2>{t("Goals and reminders")}</h2>
        <p class="muted">{t("Set a daily reading goal and a reminder on the stats screen.")}</p>
        <Button onClick={() => navigate({ name: "stats" })}><Icon name="chart" size={18} /> {t("Open reading stats")}</Button>
      </section>

      <section class="card" id="set-book-details">
        <h2>{t("Book details")}</h2>
        <label class="toggle">
          <input type="checkbox" checked={s.lookupOn.value} onChange={(e) => saveSetting("lookupOn", e.currentTarget.checked)} />
          {t("Look up book details online")}
        </label>
        <p class="muted small">{t("Off by default. When you search, only the text you type is sent to Open Library and Google Books, to find titles, authors and covers. Nothing else leaves this device.")}</p>
      </section>

      <section class="card" id="set-your-data">
        <h2>{t("Your data")}</h2>
        <p class="muted">{t("Books, notes and reading history are stored only on this device.")}</p>
        {storageInfo.value && (
          <p class="muted small">
            {t("Using {used} MB.", { used: mb(storageInfo.value.used) })}{" "}
            {storageInfo.value.persisted
              ? t("Stored permanently: the browser will not clear it to save space.")
              : t("The browser may clear it if the device runs out of space. Keep a backup.")}
          </p>
        )}
        <Button onClick={() => setBackupOpen(true)}><Icon name="backup" size={18} /> {t("Back up and restore")}</Button>
      </section>

      {desktop && (
        <section class="card" id="set-updates">
          <h2>{t("Updates")}</h2>
          <Button onClick={async () => {
            setUpdate("checking");
            setUpdate(await desktop!.checkForUpdates().catch(() => "error" as const));
          }} disabled={update === "checking"}>{t("Check for updates")}</Button>
          {update && update !== "checking" && (
            <p class="muted small" role="status">
              {update === "error" && t("Could not check for updates. Try again later.")}
              {update !== "error" && update.status === "off" && t("Update checks are not set up for this build.")}
              {update !== "error" && update.status === "current" && t("You have the latest version ({v}).", { v: update.current })}
              {update !== "error" && update.status === "available" && (
                <>
                  {t("Version {v} is available.", { v: update.latest })}{" "}
                  <button type="button" class="link" onClick={() => desktop!.openExternal(update.url)}>{t("Download")}</button>
                </>
              )}
            </p>
          )}
        </section>
      )}

      <section class="card about" id="set-about">
        <h2>{t("About")}</h2>
        <p class="about-name"><Brand size={24} /> <span>{t("version {v}", { v: __APP_VERSION__ })}</span></p>
        <p>{t("Your books, notes and reading history stay on this device. Nothing is sent anywhere unless you turn on online book details.")}</p>
        <p><a class="link" href={`${import.meta.env.BASE_URL}about/${lang.value === "ar" ? "ar.html" : ""}`} target="_blank" rel="noopener">{t("What Reader343 does")}</a></p>
        <p class="muted small">{t("MIT license. PDF rendering by Mozilla PDF.js (Apache-2.0). Typeface: Inter (SIL Open Font License).")}</p>
      </section>

      <BackupSheet repos={repos} open={backupOpen} onClose={() => setBackupOpen(false)} onRestored={() => {}} />
    </div>
  );
}
