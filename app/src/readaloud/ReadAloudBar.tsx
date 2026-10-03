import { useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import type { useReadAloud } from "./useReadAloud";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const PITCHES: [number, string][] = [[0.8, "Low"], [0.9, "Lower"], [1, "Normal"], [1.1, "Higher"], [1.25, "High"]];
const SLEEP: ["off" | 15 | 30 | 60 | "chapter", string][] = [["off", "Off"], [15, "15 min"], [30, "30 min"], [60, "60 min"], ["chapter", "End of chapter"]];
const LANG_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };

type Controller = ReturnType<typeof useReadAloud>;

export function ReadAloudBar({ ra, page }: { ra: Controller; page: number }) {
  const [panel, setPanel] = useState(false);
  if (!ra.open) return null;
  const playing = ra.state === "playing";
  const rate = settings.readRate.value;
  const nextSpeed = SPEEDS.find((s) => s > rate + 0.01) ?? SPEEDS[0];
  const langVoices = ra.voices.filter((v) => v.lang.toLowerCase().startsWith(ra.lang));
  const voiceChoices = langVoices.length ? langVoices : ra.voices;
  const sleepLabel = ra.sleep.kind === "off" ? ra.notice : ra.sleep.kind === "chapter" ? "Stops at chapter end" : "Stops in {n} min";

  if (ra.unsupported) {
    return (
      <div class="read-bar" role="region" aria-label={t("Read aloud")}>
        <span class="read-msg">{t("This browser cannot read aloud.")}</span>
        <IconButton label={t("Close read aloud")} icon="close" onClick={ra.close} />
      </div>
    );
  }

  return (
    <>
      <div class="read-bar" role="region" aria-label={t("Read aloud")}>
        <IconButton label={t("Previous sentence")} icon="skipBack" onClick={() => ra.skip(-1)} disabled={ra.state === "idle"} />
        <button type="button" class="read-play" aria-label={t(playing ? "Pause reading" : "Read aloud from here")}
          onClick={() => ra.toggle(page)}>
          <Icon name={playing ? "pause" : "play"} size={22} />
        </button>
        <IconButton label={t("Next sentence")} icon="skipForward" onClick={() => ra.skip(1)} disabled={ra.state === "idle"} />
        <button type="button" class="read-speed" aria-label={t("Speed {n}×. Change speed", { n: rate })}
          onClick={() => { saveSetting("readRate", nextSpeed); ra.applyOptions(); }}>
          {rate}×
        </button>
        <IconButton label={t("Read aloud settings")} icon="settings" onClick={() => setPanel(true)} />
        <IconButton label={t("Close read aloud")} icon="close" onClick={ra.close} />
        {sleepLabel && <span class="read-sleep" role="status"><Icon name="moonTimer" size={14} /> {t(sleepLabel, { n: ra.sleep.kind === "minutes" ? ra.sleep.minutes : 0 })}</span>}
      </div>

      <Sheet open={panel} title={t("Read aloud")} onClose={() => setPanel(false)}>
        <label class="field">
          <span>{t("Voice")} ({t(LANG_NAMES[ra.lang] ?? ra.lang)})</span>
          <select value={settings.readVoices.value[ra.lang] ?? ""}
            onChange={(e) => { saveSetting("readVoices", { ...settings.readVoices.value, [ra.lang]: e.currentTarget.value }); ra.applyOptions(); }}>
            <option value="">{t("System default")}</option>
            {voiceChoices.map((v) => <option value={v.uri}>{v.name} ({v.lang})</option>)}
          </select>
        </label>
        <fieldset class="seg">
          <legend>{t("Speed")}</legend>
          {SPEEDS.map((s) => (
            <label><input type="radio" name="rate" checked={rate === s} onChange={() => { saveSetting("readRate", s); ra.applyOptions(); }} />{s}×</label>
          ))}
        </fieldset>
        <fieldset class="seg">
          <legend>{t("Pitch")}</legend>
          {PITCHES.map(([p, label]) => (
            <label><input type="radio" name="pitch" checked={settings.readPitch.value === p}
              onChange={() => { saveSetting("readPitch", p); ra.applyOptions(); }} />{t(label)}</label>
          ))}
        </fieldset>
        <fieldset class="seg">
          <legend>{t("Sleep timer")}</legend>
          {SLEEP.map(([k, label]) => (
            <label><input type="radio" name="sleep"
              checked={k === "off" ? ra.sleep.kind === "off" : k === "chapter" ? ra.sleep.kind === "chapter" : ra.sleep.kind === "minutes" && ra.sleep.minutes === k}
              onChange={() => ra.setSleep(k, page)} />{t(label)}</label>
          ))}
        </fieldset>
        <label class="toggle">
          <input type="checkbox" checked={settings.readAutoPage.value} onChange={(e) => saveSetting("readAutoPage", e.currentTarget.checked)} />
          {t("Continue to the next page")}
        </label>
      </Sheet>
    </>
  );
}
