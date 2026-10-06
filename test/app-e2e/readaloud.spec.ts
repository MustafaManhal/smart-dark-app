import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { expectPage, openSample } from "./helpers/reader";

// Headless browsers have no voices; this stand-in "speaks" each utterance for 40ms
// and records what was said, with rate and language.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const spoken: { text: string; rate: number; lang: string; voice: string }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    let timer: ReturnType<typeof setTimeout> | undefined;
    class Utterance {
      rate = 1; pitch = 1; volume = 1; lang = ""; voice: { name: string } | null = null;
      onstart: ((e: Event) => void) | null = null;
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      constructor(public text: string) {}
    }
    const synth = {
      speaking: false,
      onvoiceschanged: null,
      // In the order a device might list them: an old robotic voice first, a better one after it.
      getVoices: () => [
        { voiceURI: "fred", name: "Fred", lang: "en-US", localService: true },
        { voiceURI: "test-en", name: "Test English", lang: "en-US", localService: true },
        { voiceURI: "sam", name: "Samantha (Enhanced)", lang: "en-US", localService: true },
        { voiceURI: "amelie", name: "Amélie", lang: "fr-CA", localService: true },
      ],
      speak(u: Utterance) {
        if (u.text.trim()) spoken.push({ text: u.text, rate: u.rate, lang: u.lang, voice: u.voice?.name ?? "" });
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
  page.evaluate(() => (window as unknown as { __spoken: { text: string; rate: number; lang: string; voice: string }[] }).__spoken);

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

test("speed changes in steps of 0.25", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  const bar = page.getByRole("region", { name: "Read aloud" });
  await bar.getByRole("button", { name: "Faster" }).click();
  await expect(bar.locator(".speed-now")).toHaveText("1.25×");
  await expect.poll(async () => (await spoken(page)).at(-1)?.rate).toBe(1.25);
  for (let i = 0; i < 3; i++) await bar.getByRole("button", { name: "Slower" }).click();
  await expect(bar.locator(".speed-now")).toHaveText("0.5×");
  await expect.poll(async () => (await spoken(page)).at(-1)?.rate).toBe(0.5);
  await bar.getByRole("button", { name: "Slower" }).click();
  await expect(bar.locator(".speed-now")).toHaveText("0.25×");
  await expect(bar.getByRole("button", { name: "Slower" })).toBeDisabled();
});

test("smart reading leaves out chart labels and says links as a word", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  // Read on until the caption under the photo, which comes after the chart.
  await expect.poll(async () => (await spoken(page)).some((s) => s.text.includes("Photo: kept in its real colors")), { timeout: 15000 }).toBe(true);
  const said = (await spoken(page)).map((s) => s.text);
  expect(said.some((x) => x.includes("N S E W C"))).toBe(false);
  expect(said.some((x) => x.includes("https://"))).toBe(false);
  expect(said.some((x) => /Purple note link/.test(x))).toBe(true);
  expect(said.some((x) => x.includes("Revenue by region"))).toBe(true);
});

test("with smart reading off everything on the page is read", async ({ page }) => {
  await openSample(page);
  await page.evaluate(() => ((window as unknown as { __speechMs: number }).__speechMs = 150)); // time to change the setting
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  const bar = page.getByRole("region", { name: "Read aloud" });
  await bar.getByRole("button", { name: "Pause reading" }).click();
  await page.getByRole("button", { name: "Read aloud settings" }).click();
  const sheet = page.getByRole("dialog", { name: "Read aloud" });
  await sheet.getByRole("checkbox", { name: /Smart reading/ }).uncheck();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => ((window as unknown as { __speechMs: number }).__speechMs = 20));
  // Leaving and coming back reads the page again with the new setting.
  await bar.getByRole("button", { name: "Close read aloud" }).click();
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).some((s) => s.text.includes("N S E W C")), { timeout: 15000 }).toBe(true);
  expect((await spoken(page)).some((s) => s.text.includes("https://example.com/link"))).toBe(true);
});

test("the best device voice reads by default, and every voice can be heard and chosen", async ({ page }) => {
  await openSample(page);
  await page.evaluate(() => ((window as unknown as { __speechMs: number }).__speechMs = 200));
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(0);
  // Not "Fred", the first voice the device lists.
  expect((await spoken(page))[0].voice).toBe("Samantha (Enhanced)");

  await page.getByRole("button", { name: "Read aloud settings" }).click();
  const sheet = page.getByRole("dialog", { name: "Read aloud" });
  const names = sheet.getByRole("list", { name: "Device voices" }).locator(".voice-name");
  await expect(names).toHaveText(["Samantha (Enhanced)", "Test English", "Fred"]); // best first, no French voice
  await expect(sheet.getByRole("radio", { name: /Samantha/ })).toBeChecked();
  await page.screenshot({ path: `test/output/voices-${test.info().project.name}.png` });

  await sheet.getByRole("button", { name: "Hear Test English" }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatchObject({ voice: "Test English", text: "This is how I sound when I read your book." });

  await sheet.getByRole("radio", { name: /Test English/ }).check();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("region", { name: "Read aloud" }).getByRole("button", { name: "Read aloud from here" }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.voice).toBe("Test English");
  await page.reload();
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)?.voice).toBe("Test English");
});

test("phones keep device voices: natural voices are not offered", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await openSample(page);
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await page.getByRole("button", { name: "Read aloud settings" }).click();
  const sheet = page.getByRole("dialog", { name: "Read aloud" });
  await expect(sheet.getByRole("list", { name: "Device voices" })).toBeVisible();
  await expect(sheet.getByText("Natural voices")).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /Download natural voices/ })).toHaveCount(0);
});

// The speech model (326 MB) is read from a local copy that scripts/serve-app.mjs serves.
const MODEL = "node_modules/.cache/smart-dark-tts/model/onnx/model.onnx";

test("natural voices: download once, pick a voice, hear real speech", async ({ page, isMobile, browserName }) => {
  test.skip(isMobile || browserName !== "chromium", "computers only");
  test.skip(!existsSync(MODEL), `needs the speech model at ${MODEL}`);
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    (window as unknown as { __smartDarkModelHost: string }).__smartDarkModelHost = `${location.origin}/__model/`;
    // Count the audio clips that are played, with their length and loudness.
    const clips: { seconds: number; peak: number }[] = [];
    (window as unknown as { __clips: typeof clips }).__clips = clips;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const data = this.buffer!.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i += 11) peak = Math.max(peak, Math.abs(data[i]));
      clips.push({ seconds: this.buffer!.duration, peak });
      return start.apply(this, args);
    };
  });
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await openSample(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true); // threads for the voice engine

  await page.evaluate(() => ((window as unknown as { __speechMs: number }).__speechMs = 400));
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  const bar = page.getByRole("region", { name: "Read aloud" });
  await bar.getByRole("button", { name: "Pause reading" }).click();
  await page.getByRole("button", { name: "Read aloud settings" }).click();
  const sheet = page.getByRole("dialog", { name: "Read aloud" });
  await expect(sheet.getByText(/28 natural English voices/)).toBeVisible();
  await sheet.getByRole("button", { name: "Download natural voices (326 MB)" }).click();

  const natural = sheet.getByRole("list", { name: "Natural voices" });
  await expect(natural).toBeVisible({ timeout: 90_000 });
  await expect(natural.getByRole("listitem")).toHaveCount(28);
  await expect(natural.getByRole("radio", { name: /Heart/ })).toBeChecked(); // used at once
  await expect(sheet.getByRole("group", { name: "Pitch" })).toHaveCount(0); // natural voices have their own pitch
  await page.screenshot({ path: "test/output/natural-voices.png" });

  // Hear another voice, then read the page with the chosen one.
  const clips = () => page.evaluate(() => (window as unknown as { __clips: { seconds: number; peak: number }[] }).__clips);
  await natural.getByRole("button", { name: "Hear Emma" }).click();
  await expect.poll(async () => (await clips()).length, { timeout: 60_000 }).toBe(1);
  expect((await clips())[0].seconds).toBeGreaterThan(1.5);
  expect((await clips())[0].peak).toBeGreaterThan(0.1); // speech, not silence

  await sheet.getByRole("button", { name: "Close", exact: true }).click();
  const deviceCount = (await spoken(page)).length;
  await bar.getByRole("button", { name: "Read aloud from here" }).click();
  await expect.poll(async () => (await clips()).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  expect((await clips()).slice(1).every((c) => c.peak > 0.1)).toBe(true);
  expect((await spoken(page)).length).toBe(deviceCount); // the device voice stayed silent
  await expect(page.locator(".spoken").first()).toBeVisible();
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);

  // The choice and the download are remembered.
  await page.reload();
  await page.getByRole("button", { name: "Read aloud", exact: true }).click();
  await expect.poll(async () => (await clips()).length, { timeout: 60_000 }).toBeGreaterThanOrEqual(1);
  await page.getByRole("region", { name: "Read aloud" }).getByRole("button", { name: "Pause reading" }).click();
  await page.getByRole("button", { name: "Read aloud settings" }).click();
  await expect(page.getByRole("dialog", { name: "Read aloud" }).getByRole("radio", { name: /Heart/ })).toBeChecked();
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
