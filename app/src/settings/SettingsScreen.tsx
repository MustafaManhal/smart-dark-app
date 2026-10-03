import { useState } from "preact/hooks";
import { BackupSheet } from "../backup/BackupSheet";
import type { Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { navigate } from "../router";
import { saveSetting, settings, type AppTheme, type DarkTheme, type ImageMode, type PageStyle } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import "./settings.css";

function Choice<T extends string | number>({ name, legend, value, options, onPick }: {
  name: string; legend: string; value: T; options: [T, string][]; onPick: (v: T) => void;
}) {
  return (
    <fieldset class="seg">
      <legend>{legend}</legend>
      {options.map(([v, label]) => (
        <label><input type="radio" name={name} checked={value === v} onChange={() => onPick(v)} />{label}</label>
      ))}
    </fieldset>
  );
}

export function SettingsScreen({ repos }: { repos: Repos }) {
  const [backupOpen, setBackupOpen] = useState(false);
  const s = settings;
  return (
    <div class="settings">
      <header class="settings-head">
        <IconButton label={t("Back to library")} icon="back" onClick={() => navigate({ name: "library" })} />
        <h1>{t("Settings")}</h1>
      </header>

      <section class="card">
        <h2>{t("Appearance")}</h2>
        <Choice<AppTheme> name="appTheme" legend={t("App theme")} value={s.appTheme.value}
          options={[["system", t("Match device")], ["light", t("Light")], ["dark", t("Dark")]]}
          onPick={(v) => saveSetting("appTheme", v)} />
        <Choice<PageStyle> name="pageStyle" legend={t("Pages")} value={s.pageStyle.value}
          options={[["original", t("Original")], ["sepia", t("Sepia")], ["dark", t("Smart dark")]]}
          onPick={(v) => saveSetting("pageStyle", v)} />
        {s.pageStyle.value === "dark" && (
          <>
            <Choice<DarkTheme> name="darkTheme" legend={t("Dark theme")} value={s.darkTheme.value}
              options={[["dark", t("Dark")], ["dim", t("Dim")], ["black", t("Black")], ["warm", t("Warm")], ["slate", t("Slate")]]}
              onPick={(v) => saveSetting("darkTheme", v)} />
            <Choice<ImageMode> name="imageMode" legend={t("Images")} value={s.imageMode.value}
              options={[["smart", t("Smart")], ["keep", t("Keep")], ["dim", t("Dim")], ["invert", t("Darken")]]}
              onPick={(v) => saveSetting("imageMode", v)} />
            <p class="muted small">{t("Smart keeps photos in their real colors and darkens scanned pages.")}</p>
          </>
        )}
      </section>

      <section class="card">
        <h2>{t("Language")}</h2>
        <Choice name="language" legend={t("App language")} value={s.language.value}
          options={[["system", t("Match device")], ["en", "English"], ["ar", "العربية"]]}
          onPick={(v) => saveSetting("language", v)} />
      </section>

      <section class="card">
        <h2>{t("Read aloud")}</h2>
        <Choice<number> name="readRate" legend={t("Speed")} value={s.readRate.value}
          options={[[0.75, "0.75×"], [1, "1×"], [1.25, "1.25×"], [1.5, "1.5×"], [2, "2×"]]}
          onPick={(v) => saveSetting("readRate", v)} />
        <label class="toggle">
          <input type="checkbox" checked={s.readAutoPage.value} onChange={(e) => saveSetting("readAutoPage", e.currentTarget.checked)} />
          {t("Continue to the next page")}
        </label>
      </section>

      <section class="card">
        <h2>{t("Goals and reminders")}</h2>
        <p class="muted">{t("Set a daily reading goal and a reminder on the stats screen.")}</p>
        <Button onClick={() => navigate({ name: "stats" })}><Icon name="chart" size={18} /> {t("Open reading stats")}</Button>
      </section>

      <section class="card">
        <h2>{t("Book details")}</h2>
        <label class="toggle">
          <input type="checkbox" checked={s.lookupOn.value} onChange={(e) => saveSetting("lookupOn", e.currentTarget.checked)} />
          {t("Look up book details online")}
        </label>
        <p class="muted small">{t("Off by default. When you search, only the text you type is sent to Open Library and Google Books, to find titles, authors and covers. Nothing else leaves this device.")}</p>
      </section>

      <section class="card">
        <h2>{t("Your data")}</h2>
        <p class="muted">{t("Books, notes and reading history are stored only on this device.")}</p>
        <Button onClick={() => setBackupOpen(true)}><Icon name="backup" size={18} /> {t("Back up and restore")}</Button>
      </section>

      <section class="card about">
        <h2>{t("About")}</h2>
        <p>{t("Smart Dark Reader, version {v}", { v: __APP_VERSION__ })}</p>
        <p class="muted small">{t("MIT license. PDF rendering by Mozilla PDF.js (Apache-2.0).")}</p>
      </section>

      <BackupSheet repos={repos} open={backupOpen} onClose={() => setBackupOpen(false)} onRestored={() => {}} />
    </div>
  );
}
