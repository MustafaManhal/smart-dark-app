import { useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { MODEL_MB, NATURAL_PREFIX, NATURAL_VOICES, naturalProgress, naturalStatus, naturalSupported } from "./neural";
import { previewVoice } from "./speaker";
import type { useReadAloud } from "./useReadAloud";
import { rankVoices } from "./voices";

const LANG_NAMES: Record<string, string> = { en: "English", ar: "Arabic" };
const SAMPLE: Record<string, string> = {
  en: "This is how I sound when I read your book.",
  ar: "هكذا يبدو صوتي عندما أقرأ كتابك.",
};

/** Every voice that can read the current language, the best ones first, each with a button to hear it. */
export function VoicePicker({ ra }: { ra: ReturnType<typeof useReadAloud> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const lang = ra.lang;
  const device = rankVoices(ra.voices, lang, navigator.language);
  const chosen = settings.readVoices.value[lang] ?? "";
  const natural = lang === "en" && naturalSupported();
  const naturalReady = natural && (settings.naturalDownloaded.value || naturalStatus.value === "ready");
  // With no choice made, the best device voice reads.
  const current = chosen && (chosen.startsWith(NATURAL_PREFIX) ? naturalReady : device.some((v) => v.uri === chosen))
    ? chosen : device[0]?.uri ?? "";

  const pick = (uri: string) => {
    saveSetting("readVoices", { ...settings.readVoices.value, [lang]: uri });
    ra.applyOptions();
  };
  const preview = async (uri: string) => {
    ra.pause();
    setBusy(uri);
    await previewVoice(uri, SAMPLE[lang] ?? SAMPLE.en, lang, settings.readRate.value);
    setBusy(null);
  };
  const row = (uri: string, name: string, detail: string) => (
    <li class="voice-row">
      <label>
        <input type="radio" name="voice" checked={current === uri} onChange={() => pick(uri)} />
        <span class="voice-name">{name}</span>
        <span class="voice-detail">{detail}</span>
      </label>
      <IconButton label={t("Hear {name}", { name })} icon="play" class={busy === uri ? "is-busy" : ""} onClick={() => preview(uri)} />
    </li>
  );

  return (
    <section class="voices" aria-label={t("Voice")}>
      <h3>{t("Voice")} ({t(LANG_NAMES[lang] ?? lang)})</h3>

      {natural && (
        <>
          <h4>{t("Natural voices")}</h4>
          {naturalStatus.value === "loading" && (
            <div class="voice-load" role="status">
              <progress max={1} value={naturalProgress.value} aria-label={t("Natural voices")} />
              <span>{t("Getting the voices ready… {n}%", { n: Math.round(naturalProgress.value * 100) })}</span>
            </div>
          )}
          {naturalStatus.value === "error" && (
            <p class="voice-note is-error" role="alert">
              {t("The natural voices could not be loaded. Check your connection and try again.")}
            </p>
          )}
          {!naturalReady && naturalStatus.value !== "loading" && (
            <>
              <p class="voice-note">
                {t("{count} natural English voices that run on this computer. One download, then they work offline. What you read never leaves this device.", { count: NATURAL_VOICES.length })}
              </p>
              <Button variant="primary" onClick={ra.downloadNatural}>
                {t(naturalStatus.value === "error" ? "Try again" : "Download natural voices ({n} MB)", { n: MODEL_MB })}
              </Button>
            </>
          )}
          {naturalReady && (
            <ul class="voice-list" aria-label={t("Natural voices")}>
              {NATURAL_VOICES.map((v) => row(NATURAL_PREFIX + v.id, v.name, `${t(v.accent)}, ${t(v.gender)}`))}
            </ul>
          )}
          <h4>{t("Device voices")}</h4>
        </>
      )}

      {device.length
        ? <ul class="voice-list" aria-label={t("Device voices")}>{device.map((v) => row(v.uri, v.name, v.lang))}</ul>
        : <p class="voice-note">{t("This device has no voice for this language.")}</p>}
      <p class="voice-note">
        {lang === "en" && !natural ? "" : lang !== "en" && naturalSupported() ? `${t("Natural voices read English. Other languages use a device voice.")} ` : ""}
        {t("For better device voices, open the Accessibility settings of this device and download a voice marked Enhanced or Premium.")}
      </p>
    </section>
  );
}

/** Reading speed in steps of 0.25, from 0.25× to 3×. */
export function SpeedStepper({ onChange }: { onChange?: () => void }) {
  const rate = settings.readRate.value;
  const set = (next: number) => {
    saveSetting("readRate", Math.min(3, Math.max(0.25, Math.round(next * 4) / 4)));
    onChange?.();
  };
  return (
    <div class="speed-step" role="group" aria-label={t("Speed")}>
      <IconButton label={t("Slower")} icon="minus" disabled={rate <= 0.25} onClick={() => set(rate - 0.25)} />
      <span class="speed-now" aria-live="polite" aria-label={t("Speed {n}×", { n: rate })}>{rate}×</span>
      <IconButton label={t("Faster")} icon="plus" disabled={rate >= 3} onClick={() => set(rate + 0.25)} />
    </div>
  );
}
