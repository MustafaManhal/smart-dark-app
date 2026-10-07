import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

/** A stand-in for the model a browser may have built in (Chrome and Edge on computers). */
async function withModel(page: Page) {
  await page.addInitScript(() => {
    const api = <T>(make: () => T) => ({
      availability: async () => "downloadable",
      create: async (options: { monitor?: (m: { addEventListener: (t: string, f: (e: { loaded: number }) => void) => void }) => void }) => {
        // The browser fetches its model the first time: half way, then done.
        options?.monitor?.({ addEventListener: (_t, f) => { f({ loaded: 0.5 }); setTimeout(() => f({ loaded: 1 }), 150); } });
        await new Promise((r) => setTimeout(r, 400));
        return make();
      },
    });
    Object.assign(window, {
      Summarizer: api(() => ({ summarize: async (text: string) => `Main points of ${text.length > 1000 ? "a long" : "a short"} text.` })),
      Translator: api(() => ({ translate: async (text: string) => `ترجمة: ${text}` })),
      LanguageDetector: api(() => ({ detect: async () => [{ detectedLanguage: "en", confidence: 0.99 }] })),
      LanguageModel: api(() => ({ prompt: async (text: string) => `In plain words: ${text.split("Passage:\n")[1]}` })),
    });
  });
}

async function select(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const range = document.createRange();
    range.setStart(node, node.textContent!.indexOf(t));
    range.setEnd(node, node.textContent!.indexOf(t) + t.length);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, text);
}

test("a browser without its own model shows none of this", async ({ page }) => {
  // (the test's own browser may have these APIs: take them away, as on Safari, Firefox or a phone)
  await page.addInitScript(() => { for (const name of ["Summarizer", "Translator", "LanguageDetector", "LanguageModel"]) delete (window as unknown as Record<string, unknown>)[name]; });
  await openSample(page);
  await select(page, "colored words keep their hue");
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("button", { name: "Explain or translate" })).toHaveCount(0);
  await page.locator(".reader-title").click();
  await page.getByRole("button", { name: "All tools" }).click();
  await expect(page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Summarize/ })).toHaveCount(0);
});

test("with the browser's model: a passage is explained and translated", async ({ page }) => {
  await withModel(page);
  await openSample(page);
  await select(page, "colored words keep their hue");
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar).toBeInViewport({ ratio: 1 });
  await bar.getByRole("button", { name: "Explain or translate" }).click();
  const sheet = page.getByRole("dialog", { name: "Ask the browser's model" });
  await expect(sheet.locator(".ai-source")).toHaveText("colored words keep their hue");
  await expect(sheet).toContainText("The text is not sent anywhere.");
  await expect(sheet.getByRole("button", { name: "Summarize" })).toHaveCount(0); // a short passage has nothing to shorten

  await sheet.getByRole("button", { name: "Explain" }).click();
  await expect(sheet.locator(".ai-note")).toContainText("getting its model ready: 50%");
  await expect(sheet.locator(".ai-answer")).toHaveText("In plain words: colored words keep their hue");
  await sheet.getByRole("button", { name: "Translate" }).click();
  await expect(sheet.locator(".ai-answer")).toContainText("ترجمة: colored words keep their hue");
  await expect(sheet).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `test/output/ai-${test.info().project.name}.png` });
});

test("with the browser's model: the chapter being read is summarized from the All tools", async ({ page }) => {
  await withModel(page);
  await openSample(page);
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Summarize this chapter/ }).click();
  const sheet = page.getByRole("dialog", { name: "Quarterly report" }); // the chapter's name
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Summarize" }).click();
  await expect(sheet.locator(".ai-answer")).toHaveText("Main points of a short text.");
  await sheet.getByRole("button", { name: "Copy" }).click();
});

test("a model that cannot run on this computer keeps the features hidden; one that fails says so", async ({ page }) => {
  await page.addInitScript(() => {
    const none = { availability: async () => "unavailable" };
    Object.assign(window, { Summarizer: none, Translator: none, LanguageDetector: none,
      LanguageModel: { availability: async () => "available", create: async () => ({ prompt: async () => { throw new Error("out of memory"); } }) } });
  });
  await openSample(page);
  await page.getByRole("button", { name: "All tools" }).click();
  await expect(page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Summarize/ })).toHaveCount(0);
  await page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: "Close" }).click();
  await select(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Explain or translate" }).click();
  const sheet = page.getByRole("dialog", { name: "Ask the browser's model" });
  await expect(sheet.getByRole("button", { name: "Translate" })).toHaveCount(0);
  await sheet.getByRole("button", { name: "Explain" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("The browser's model could not finish. Try again.");
});
