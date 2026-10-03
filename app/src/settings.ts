import { signal, type Signal } from "@preact/signals";
import type { SettingsRepo } from "./db/repos";

export type PageStyle = "original" | "sepia" | "dark";
export type DarkTheme = "dark" | "dim" | "black" | "warm" | "slate";
export type ImageMode = "smart" | "keep" | "dim" | "invert";
export type AppTheme = "system" | "light" | "dark";

const defaults = {
  pageStyle: "dark" as PageStyle,
  darkTheme: "dark" as DarkTheme,
  imageMode: "smart" as ImageMode,
  appTheme: "system" as AppTheme,
  readRate: 1,
  readPitch: 1,
  readVoices: {} as Record<string, string>, // language -> voiceURI
  readAutoPage: true,
  goalUnit: "minutes" as "minutes" | "pages",
  goalValue: 0, // 0 = no daily goal
  reminderOn: false,
  reminderTime: "19:00",
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
