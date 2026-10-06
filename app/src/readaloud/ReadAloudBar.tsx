import { useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import type { useReadAloud } from "./useReadAloud";
import { SpeedStepper, VoicePicker } from "./VoicePicker";
import { naturalId } from "./neural";

const PITCHES: [number, string][] = [[0.8, "Low"], [0.9, "Lower"], [1, "Normal"], [1.1, "Higher"], [1.25, "High"]];
const SLEEP: ["off" | 15 | 30 | 60 | "chapter", string][] = [["off", "Off"], [15, "15 min"], [30, "30 min"], [60, "60 min"], ["chapter", "End of chapter"]];

type Controller = ReturnType<typeof useReadAloud>;

export function ReadAloudBar({ ra, page }: { ra: Controller; page: number }) {
  const [panel, setPanel] = useState(false);
  if (!ra.open) return null;
  const playing = ra.state === "playing";
  const usesNatural = !!naturalId(settings.readVoices.value[ra.lang]);
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
        <SpeedStepper onChange={ra.applyOptions} />
        <IconButton label={t("Read aloud settings")} icon="settings" onClick={() => setPanel(true)} />
        <IconButton label={t("Close read aloud")} icon="close" onClick={ra.close} />
        {ra.waiting && <span class="read-sleep" role="status">{t("Preparing the voice…")}</span>}
        {sleepLabel && !ra.waiting && <span class="read-sleep" role="status"><Icon name="moonTimer" size={14} /> {t(sleepLabel, { n: ra.sleep.kind === "minutes" ? ra.sleep.minutes : 0 })}</span>}
      </div>

      <Sheet open={panel} title={t("Read aloud")} onClose={() => setPanel(false)}>
        <div class="read-speed-row">
          <span>{t("Speed")}</span>
          <SpeedStepper onChange={ra.applyOptions} />
        </div>
        <VoicePicker ra={ra} />
        {!usesNatural && (
          <fieldset class="seg">
            <legend>{t("Pitch")}</legend>
            {PITCHES.map(([p, label]) => (
              <label><input type="radio" name="pitch" checked={settings.readPitch.value === p}
                onChange={() => { saveSetting("readPitch", p); ra.applyOptions(); }} />{t(label)}</label>
            ))}
          </fieldset>
        )}
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
        <label class="toggle">
          <input type="checkbox" checked={settings.readSmart.value} onChange={(e) => saveSetting("readSmart", e.currentTarget.checked)} />
          {t("Smart reading: skip page numbers, headers, links and footnote marks")}
        </label>
      </Sheet>
    </>
  );
}
