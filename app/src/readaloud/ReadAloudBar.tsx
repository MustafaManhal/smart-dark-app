import { useState } from "preact/hooks";
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
  const sleepLabel = ra.sleep.kind === "off" ? ra.notice : ra.sleep.kind === "chapter" ? "Stops at chapter end" : `Stops in ${ra.sleep.minutes} min`;

  if (ra.unsupported) {
    return (
      <div class="read-bar" role="region" aria-label="Read aloud">
        <span class="read-msg">This browser cannot read aloud.</span>
        <IconButton label="Close read aloud" icon="close" onClick={ra.close} />
      </div>
    );
  }

  return (
    <>
      <div class="read-bar" role="region" aria-label="Read aloud">
        <IconButton label="Previous sentence" icon="skipBack" onClick={() => ra.skip(-1)} disabled={ra.state === "idle"} />
        <button type="button" class="read-play" aria-label={playing ? "Pause reading" : "Read aloud from here"}
          onClick={() => ra.toggle(page)}>
          <Icon name={playing ? "pause" : "play"} size={22} />
        </button>
        <IconButton label="Next sentence" icon="skipForward" onClick={() => ra.skip(1)} disabled={ra.state === "idle"} />
        <button type="button" class="read-speed" aria-label={`Speed ${rate}×. Change speed`}
          onClick={() => { saveSetting("readRate", nextSpeed); ra.applyOptions(); }}>
          {rate}×
        </button>
        <IconButton label="Read aloud settings" icon="settings" onClick={() => setPanel(true)} />
        <IconButton label="Close read aloud" icon="close" onClick={ra.close} />
        {sleepLabel && <span class="read-sleep" role="status"><Icon name="moonTimer" size={14} /> {sleepLabel}</span>}
      </div>

      <Sheet open={panel} title="Read aloud" onClose={() => setPanel(false)}>
        <label class="field">
          <span>Voice ({LANG_NAMES[ra.lang] ?? ra.lang})</span>
          <select value={settings.readVoices.value[ra.lang] ?? ""}
            onChange={(e) => { saveSetting("readVoices", { ...settings.readVoices.value, [ra.lang]: e.currentTarget.value }); ra.applyOptions(); }}>
            <option value="">System default</option>
            {voiceChoices.map((v) => <option value={v.uri}>{v.name} ({v.lang})</option>)}
          </select>
        </label>
        <fieldset class="seg">
          <legend>Speed</legend>
          {SPEEDS.map((s) => (
            <label><input type="radio" name="rate" checked={rate === s} onChange={() => { saveSetting("readRate", s); ra.applyOptions(); }} />{s}×</label>
          ))}
        </fieldset>
        <fieldset class="seg">
          <legend>Pitch</legend>
          {PITCHES.map(([p, label]) => (
            <label><input type="radio" name="pitch" checked={settings.readPitch.value === p}
              onChange={() => { saveSetting("readPitch", p); ra.applyOptions(); }} />{label}</label>
          ))}
        </fieldset>
        <fieldset class="seg">
          <legend>Sleep timer</legend>
          {SLEEP.map(([k, label]) => (
            <label><input type="radio" name="sleep"
              checked={k === "off" ? ra.sleep.kind === "off" : k === "chapter" ? ra.sleep.kind === "chapter" : ra.sleep.kind === "minutes" && ra.sleep.minutes === k}
              onChange={() => ra.setSleep(k, page)} />{label}</label>
          ))}
        </fieldset>
        <label class="toggle">
          <input type="checkbox" checked={settings.readAutoPage.value} onChange={(e) => saveSetting("readAutoPage", e.currentTarget.checked)} />
          Continue to the next page
        </label>
      </Sheet>
    </>
  );
}
