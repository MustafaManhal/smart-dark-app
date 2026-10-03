import { computed, signal } from "@preact/signals";
import { AR } from "./ar";

export type Language = "system" | "en" | "ar";

/** The language picked in settings ("system" follows the device). */
export const languageSetting = signal<Language>("system");

export const lang = computed<"en" | "ar">(() => {
  const pick = languageSetting.value;
  if (pick === "en" || pick === "ar") return pick;
  const device = typeof navigator !== "undefined" ? navigator.language : "en";
  return device.toLowerCase().startsWith("ar") ? "ar" : "en";
});

export const dir = computed(() => (lang.value === "ar" ? "rtl" : "ltr"));

/**
 * Translate an English UI string. English text is the key, so missing
 * translations fall back to readable English. `{name}` placeholders are filled
 * from `params`. Reading `lang` here re-renders components when it changes.
 */
export function t(english: string, params?: Record<string, string | number>): string {
  const text = lang.value === "ar" ? AR[english] ?? english : english;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in params ? formatNumber(params[k]) : `{${k}}`));
}

function formatNumber(v: string | number) {
  // Western digits in Arabic too: they match the page numbers printed in PDFs.
  return typeof v === "number" ? v.toLocaleString(lang.value === "ar" ? "ar-u-nu-latn" : "en") : v;
}

/** Locale for dates and numbers. */
export const locale = () => (lang.value === "ar" ? "ar-u-nu-latn" : "en");
