import { expect, test, type Page } from "@playwright/test";
import { openSample } from "./helpers/reader";

// The dictionary is played by the test: with a service worker in between, the browser would ask the real one.
test.use({ serviceWorkers: "block" });

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

test("a word can be looked up, after the reader agrees to send it (network mocked)", async ({ page }) => {
  const asked: string[] = [];
  await page.route("https://en.wiktionary.org/**", async (route) => {
    asked.push(new URL(route.request().url()).pathname);
    await route.fulfill({
      contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ en: [{ partOfSpeech: "Noun", language: "English", definitions: [{ definition: "The property of <a href=\"/wiki/color\">color</a> that tells one <b>shade</b> from another.<script>window.pwned = 1</script>" }, { definition: "A tint." }] }] }),
    });
  });
  await openSample(page);
  // A long selection has no lookup; a word has.
  await select(page, "colored words keep their hue");
  await expect(page.getByRole("toolbar", { name: "Selected text" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Look up" })).toHaveCount(0);
  await select(page, "hue");
  const bar = page.getByRole("toolbar", { name: "Selected text" });
  await expect(bar.getByRole("button", { name: "Look up" })).toBeVisible();
  await expect(bar).toBeInViewport({ ratio: 1 });
  await bar.getByRole("button", { name: "Look up" }).click();

  const sheet = page.getByRole("dialog", { name: "Look up" });
  await expect(sheet.getByRole("heading", { name: "hue" })).toBeVisible();
  // Nothing is sent before the reader says so.
  await expect(sheet).toContainText("The word is sent to en.wiktionary.org");
  expect(asked).toEqual([]);
  await sheet.getByRole("button", { name: "Turn on word lookup" }).click();
  await expect(sheet.getByRole("listitem").first()).toHaveText("The property of color that tells one shade from another.window.pwned = 1");
  await expect(sheet.getByRole("listitem")).toHaveCount(2);
  expect(asked).toEqual(["/api/rest_v1/page/definition/hue"]);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined(); // the answer is shown as text only
  await expect(sheet.getByRole("link", { name: "Open in Wiktionary" })).toHaveAttribute("href", "https://en.wiktionary.org/wiki/hue");
  await page.screenshot({ path: `test/output/lookup-word-${test.info().project.name}.png` });
  await sheet.getByRole("button", { name: "Close" }).click();

  // The choice is kept, and Settings can take it back.
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  const toggle = page.getByRole("checkbox", { name: "Look up words in Wiktionary" });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
});

test("a word the dictionary does not know, and a dictionary that cannot be reached", async ({ page }) => {
  let mode: "missing" | "down" = "missing";
  await page.route("https://en.wiktionary.org/**", (route) => (mode === "missing" ? route.fulfill({ status: 404, body: "{}" }) : route.abort()));
  await openSample(page);
  await select(page, "hue");
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Look up" }).click();
  const sheet = page.getByRole("dialog", { name: "Look up" });
  await sheet.getByRole("button", { name: "Turn on word lookup" }).click();
  await expect(sheet.getByRole("status")).toHaveText("No entry for this word.");
  await sheet.getByRole("button", { name: "Close" }).click();
  mode = "down";
  await select(page, "hue");
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Look up" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("The dictionary could not be reached. Check your connection.");
});
