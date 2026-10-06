import { effect, signal, type Signal } from "@preact/signals";
import { languageSetting, type Language } from "./i18n/i18n";
import type { SettingsRepo } from "./db/repos";

export type PageStyle = "original" | "sepia" | "dark";
export type DarkTheme = "dark" | "dim" | "black" | "warm" | "slate";
export type ImageMode = "smart" | "keep" | "dim" | "invert";
export type AppTheme = "system" | "light" | "dark";

const defaults = {
  pageStyle: "dark" as PageStyle,
  darkTheme: "dark" as DarkTheme,
  imageMode: "smart" as ImageMode,
  // Page adjustments in percent (ranges in ADJUST_RANGES, smart-invert.js).
  adjBrightness: 100,
  adjContrast: 100,
  adjSepia: 0,
  adjGrayscale: 0,
  appTheme: "system" as AppTheme,
  // Last zoom, so a book opens the way the reader left it. Scale is in renderer units.
  zoomMode: "fit" as "fit" | "page" | "manual",
  zoomScale: 1,
  readRate: 1,
  readPitch: 1,
  readVoices: {} as Record<string, string>, // language -> voiceURI
  readAutoPage: true,
  goalUnit: "minutes" as "minutes" | "pages",
  goalValue: 0, // 0 = no daily goal
  reminderOn: false,
  reminderTime: "19:00",
  language: "system" as Language,
  lookupOn: false, // online book details lookup is opt-in
};

type Settings = typeof defaults;
export const settings = Object.fromEntries(
  Object.entries(defaults).map(([k, v]) => [k, signal(v)]),
) as { [K in keyof Settings]: Signal<Settings[K]> };

let repo: SettingsRepo | null = null;

export async function loadSettings(settingsRepo: SettingsRepo) {
  repo = settingsRepo;
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    (settings[key] as Signal<unknown>).value = await settingsRepo.get(key, defaults[key]);
  }
}

export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key].value = value;
  repo?.set(key, value);
}

/** The four page adjustments, in the shape the color engine takes. */
export const adjustValues = () => ({
  brightness: settings.adjBrightness.value,
  contrast: settings.adjContrast.value,
  sepia: settings.adjSepia.value,
  grayscale: settings.adjGrayscale.value,
});

// The i18n module keeps its own signal so it has no dependency on storage.
effect(() => {
  languageSetting.value = settings.language.value;
});
