import { useState } from "preact/hooks";
import { ADJUST_DEFAULTS, ADJUST_RANGES } from "../../../src/viewer/smart-invert.js";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { Button, IconButton } from "../ui/Button";
import "./adjust.css";

export type AdjustKey = "brightness" | "contrast" | "sepia" | "grayscale";
const SETTING = {
  brightness: "adjBrightness", contrast: "adjContrast", sepia: "adjSepia", grayscale: "adjGrayscale",
} as const;
const KEYS = Object.keys(SETTING) as AdjustKey[];

/** "Off" at the default; otherwise the distance from it, like "+5" or "−10". */
export function adjustLabel(key: AdjustKey, value: number) {
  const delta = value - ADJUST_DEFAULTS[key];
  if (delta === 0) return t("Off");
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

/** Brightness, contrast, sepia and grayscale of the text (paper, charts and photos are left alone). */
export function AdjustControls() {
  // While a slider is dragged only the number follows; the page is drawn again on release.
  const [dragging, setDragging] = useState<Partial<Record<AdjustKey, number>>>({});
  const rows: { key: AdjustKey; label: string; less: string; more: string }[] = [
    { key: "brightness", label: t("Brightness"), less: t("Lower brightness"), more: t("Raise brightness") },
    { key: "contrast", label: t("Contrast"), less: t("Lower contrast"), more: t("Raise contrast") },
    { key: "sepia", label: t("Sepia"), less: t("Less sepia"), more: t("More sepia") },
    { key: "grayscale", label: t("Grayscale"), less: t("Less grayscale"), more: t("More grayscale") },
  ];
  const saved = (key: AdjustKey) => settings[SETTING[key]].value;
  const commit = (key: AdjustKey, value: number) => {
    const { min, max } = ADJUST_RANGES[key];
    saveSetting(SETTING[key], Math.min(max, Math.max(min, Math.round(value))));
    setDragging(({ [key]: _, ...rest }) => rest);
  };
  const changed = KEYS.some((key) => saved(key) !== ADJUST_DEFAULTS[key]);

  return (
    <fieldset class="adjust">
      <legend>{t("Adjust")}</legend>
      {rows.map(({ key, label, less, more }) => {
        const { min, max, step } = ADJUST_RANGES[key];
        const value = dragging[key] ?? saved(key);
        const id = `adjust-${key}`;
        return (
          <div class="adjust-row">
            <div class="adjust-head">
              <label for={id}>{label}</label>
              {/* The slider announces this value itself (aria-valuetext). */}
              <span id={`${id}-value`} class="adjust-value" dir="ltr" aria-hidden="true">{adjustLabel(key, value)}</span>
            </div>
            <div class="adjust-line">
              <IconButton label={less} icon="minus" disabled={value <= min} onClick={() => commit(key, saved(key) - step)} />
              <input id={id} type="range" min={min} max={max} step={step} value={value}
                aria-valuetext={adjustLabel(key, value)}
                onInput={(e) => setDragging((d) => ({ ...d, [key]: Number(e.currentTarget.value) }))}
                onChange={(e) => commit(key, Number(e.currentTarget.value))} />
              <IconButton label={more} icon="plus" disabled={value >= max} onClick={() => commit(key, saved(key) + step)} />
            </div>
          </div>
        );
      })}
      {changed && (
        <Button onClick={() => KEYS.forEach((key) => saveSetting(SETTING[key], ADJUST_DEFAULTS[key]))}>
          {t("Reset adjustments")}
        </Button>
      )}
    </fieldset>
  );
}
