import { expect, test } from "vitest";
import { literalKeys } from "../../scripts/i18n-keys.mjs";
import { AR, DYNAMIC_KEYS } from "../../app/src/i18n/ar";
import { dir, languageSetting, t } from "../../app/src/i18n/i18n";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every UI string has an Arabic translation", () => {
  const keys: string[] = [...literalKeys(), ...DYNAMIC_KEYS];
  const missing = keys.filter((k) => !(k in AR));
  expect(missing).toEqual([]);
});

test("translations keep the same placeholders", () => {
  for (const [en, ar] of Object.entries(AR)) expect(placeholders(ar), en).toEqual(placeholders(en));
});

test("switching language translates and flips direction", () => {
  languageSetting.value = "en";
  expect(t("Page {page}", { page: 3 })).toBe("Page 3");
  expect(dir.value).toBe("ltr");
  languageSetting.value = "ar";
  expect(t("Page {page}", { page: 3 })).toBe("الصفحة 3");
  expect(dir.value).toBe("rtl");
  expect(t("Some text nobody translated")).toBe("Some text nobody translated");
  languageSetting.value = "en";
});
