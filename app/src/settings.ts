import { effect, signal, type Signal } from "@preact/signals";
import { languageSetting, type Language } from "./i18n/i18n";
import type { SettingsRepo } from "./db/repos";

export type PageStyle = "original" | "sepia" | "dark";
export type DarkTheme = "dark" | "dim" | "black" | "warm" | "slate";
export type ImageMode = "smart" | "keep" | "dim" | "invert";
export type AppTheme = "system" | "light" | "dark";
/** scroll: one page under the other. paged: the same, but scrolling stops at each page. spread: two pages side by side. */
export type ViewLayout = "scroll" | "paged" | "spread";

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
  density: "comfortable" as "comfortable" | "compact", // compact: more books and rows on a screen
  // Last zoom, so a book opens the way the reader left it. Scale is in renderer units.
  zoomMode: "fit" as "fit" | "page" | "manual",
  zoomScale: 1,
  viewLayout: "scroll" as ViewLayout,
  spreadCover: true, // in two-page view the first page stands alone, as the cover of a book does
  spreadRtl: false, // two-page view with the first page on the right, for books read right to left
  libraryView: "grid" as "grid" | "list",
  // The drawing tool as it was last used.
  drawTool: "pen" as "pen" | "line" | "arrow" | "rect" | "ellipse" | "text" | "sign",
  signature: [] as number[], // the reader's signature: strokes in a box 1 by 1 (see draw/SignaturePad.tsx)
  drawColor: "red" as "ink" | "red" | "blue" | "green" | "orange",
  drawSize: 0.004,
  reviewNewPerDay: 10, // marks that enter the daily review each day; 0 turns the review off
  reviewDays: [] as string[], // days (YYYY-MM-DD) on which something was reviewed, for the review streak
  markStyle: "highlight" as "highlight" | "underline" | "strike", // how the next marked passage is drawn
  autoScrollSpeed: 4, // 1 to 10, see pixelsPerSecond in reader/autoscroll.tsx
  readRate: 1,
  readPitch: 1,
  readVoices: {} as Record<string, string>, // language -> voiceURI, or "natural:<id>" for a natural voice
  readAutoPage: true,
  readSmart: true, // leave out page numbers, running headers, links and footnote marks
  naturalDownloaded: false, // the natural-voice model has been downloaded on this device
  goalUnit: "minutes" as "minutes" | "pages",
  goalValue: 0, // 0 = no daily goal
  reminderOn: false,
  reminderTime: "19:00",
  language: "system" as Language,
  lookupOn: false, // online book details lookup is opt-in
  wordLookupOn: false, // looking a word up in Wiktionary is opt-in: the word leaves the device
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
