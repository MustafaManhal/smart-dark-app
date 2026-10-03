import { expect, test } from "@playwright/test";
import { expectPage, openSample } from "./helpers/reader";

// Headless browsers have no voices; this stand-in "speaks" each utterance for 40ms
// and records what was said, with rate and language.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: { text: string; rate: number; lang: string }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    let timer: ReturnType<typeof setTimeout> | undefined;
    class Utterance {
      rate = 1; pitch = 1; volume = 1; lang = ""; voice = null;
      onstart: ((e: Event) => void) | null = null;
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(public text: string) {}
    }
    const synth = {
      speaking: false,
      onvoiceschanged: null,
      getVoices: () => [{ voiceURI: "test-en", name: "Test English", lang: "en-US", localService: true }],
      speak(u: Utterance) {
        if (u.text.trim()) spoken.push({ text: u.text, rate: u.rate, lang: u.lang });
        synth.speaking = true;
        const ms = (window as unknown as { __speechMs?: number }).__speechMs ?? 40;
        timer = setTimeout(() => { synth.speaking = false; u.onend?.(new Event("end")); }, ms);
      },
      cancel() { clearTimeout(timer); synth.speaking = false; },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  });
});

const spoken = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __spoken: { text: string; rate: number; lang: string }[] }).__spoken);

test("reads the page sentence by sentence and highlights the sentence being read", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  const bar = page.getByRole("region", { name: "Read aloud" });
  await expect(bar).toBeVisible();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(1);
  const first = (await spoken(page))[0];
  expect(first.text).toContain("Quarterly Reading Report");
  expect(first.lang).toBe("en");
  await expect(page.locator(".spoken").first()).toBeVisible();
  await page.screenshot({ path: `test/output/readaloud-${test.info().project.name}.png` });

  await bar.getByRole("button", { name: "Pause reading" }).click();
  const count = (await spoken(page)).length;
  await page.waitForTimeout(200);
  expect((await spoken(page)).length).toBe(count);
  await bar.getByRole("button", { name: "Read aloud from here" }).click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(count);
});

test("continues to the next page by itself", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).some((s) => s.text.includes("Long documents render lazily")), { timeout: 15000 }).toBe(true);
  await expectPage(page, 2);
});

test("speed button changes the speaking rate", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await page.getByRole("button", { name: /Change speed/ }).click();
  await expect(page.getByRole("button", { name: /Change speed/ })).toHaveAccessibleName(/Speed 1.25×/);
  await expect.poll(async () => (await spoken(page)).at(-1)?.rate).toBe(1.25);
});

test("sleep timer at the end of the chapter stops before the next chapter", async ({ page }) => {
  await openSample(page);
  await page.evaluate(() => ((window as unknown as { __speechMs: number }).__speechMs = 150)); // time to set the timer
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await page.getByRole("button", { name: "Read aloud settings" }).click();
  await page.getByRole("radio", { name: "End of chapter" }).check();
  await page.getByRole("dialog", { name: "Read aloud" }).getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Stopped at the end of the chapter" })).toBeVisible({ timeout: 15000 });
  expect((await spoken(page)).some((s) => s.text.includes("readable"))).toBe(true);
  await page.waitForTimeout(500);
  expect((await spoken(page)).some((s) => s.text.includes("Long documents"))).toBe(false);
});
