import { expect, test } from "@playwright/test";
import { openSample } from "./helpers/reader";

// The rules of the "Open desk" design (docs/plans/2026-10-07-open-desk-redesign.md): the places of the app
// are always on screen with their names, and every tool of the reader carries a word.

test("the places of the app are on screen with their names", async ({ page, isMobile }) => {
  await page.goto("./");
  const places = page.getByRole("navigation", { name: "Places" });
  const names = isMobile ? ["Library", "Notebook", "PDF tools", "Stats", "Settings"] : ["Library", "Notebook", "PDF tools", "Reading stats", "Settings", "Back up and restore"];
  await expect(places.getByRole("button")).toHaveText(names);
  for (const button of await places.getByRole("button").all()) await expect(button).toBeInViewport({ ratio: 1 });
  await expect(places.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");

  // They stay while the screen changes, and say where the reader is.
  await places.getByRole("button", { name: "Notebook" }).click();
  await expect(page.getByRole("heading", { name: "Notebook" })).toBeVisible();
  await expect(places.getByRole("button", { name: "Notebook" })).toHaveAttribute("aria-current", "page");
  await expect(places.getByRole("button", { name: "Library" })).not.toHaveAttribute("aria-current", "page");
  await places.getByRole("button", { name: "Reading stats" }).click();
  await expect(places.getByRole("button", { name: "Reading stats" })).toHaveAttribute("aria-current", "page");
  await places.getByRole("button", { name: "Library" }).click();
  await expect(page.getByRole("heading", { name: "Your library" })).toBeVisible();
});

test("the home screen says what the app can do, and each card leads there", async ({ page }) => {
  await page.goto("./");
  const cards = page.getByRole("navigation", { name: "What you can do" }).getByRole("link");
  await expect(cards.locator("strong")).toHaveText(["Join PDFs", "Split and reorder pages", "Pictures to PDF", "All your marks", "Daily review", "Your reading", "Sync and backups"]);
  await cards.filter({ hasText: "Pictures to PDF" }).click();
  await expect(page.getByRole("heading", { name: "PDF tools" })).toBeVisible();
  await page.getByRole("navigation", { name: "Places" }).getByRole("button", { name: "Library" }).click();
  await cards.filter({ hasText: "Daily review" }).click();
  await expect(page).toHaveURL(/#\/review$/);
});

test("every tool of the reader carries its name, and all of them are on screen", async ({ page, isMobile }) => {
  await openSample(page);
  const tools = page.getByRole("toolbar", { name: "Reading tools" }).getByRole("button");
  const shown = isMobile
    ? ["Highlight", "Erase", "Sticky note", "Draw", "Bookmark", "Read aloud", "Notes", "Contents", "Appearance", "Focus"]
    : ["Highlight", "Erase", "Sticky note", "Draw", "Bookmark", "Read aloud", "Auto-scroll", "Notes", "Contents", "Appearance", "Focus", "Crop", "Rotate", "Scan text", "Print", "Save", "Pages"];
  await expect(tools.locator(".btn-text").filter({ visible: true })).toHaveText(shown);
  for (const word of shown) await expect(tools.locator(".btn-text", { hasText: new RegExp(`^${word}$`) })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "All tools" })).toHaveText("All tools");

  // What a phone's dock has no room for is in "All tools", with a name and a line each.
  await page.getByRole("button", { name: "All tools" }).click();
  const all = page.getByRole("dialog", { name: "All tools" });
  for (const name of ["Find a command", "Auto-scroll", "Crop the margins", "Turn the pages", "Page style and colors", "Print", "Save a copy", "Edit pages", "Recognize text"]) {
    await expect(all.getByRole("button", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
  }
  // A card does its job: the margins are cropped, and the toolbar shows it (on a wide screen).
  await all.getByRole("button", { name: /^Crop the margins/ }).click();
  await expect(all).toHaveCount(0);
  if (!isMobile) await expect(page.locator('.tools [data-tool="crop"]')).toHaveAttribute("aria-pressed", "true");
});

test("the tools of the e-book reader carry their names too", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a PDF/ }).click();
  await (await chooser).setFiles("test/fixtures/sample.epub");
  await page.getByRole("list", { name: "Books" }).getByText("The Lighthouse Ledger").click();
  await expect(page.locator(".ebook-title small")).toHaveText("One: The Keeper");
  await expect(page.getByRole("toolbar", { name: "Reading tools" }).locator(".btn-text")).toHaveText(["Search", "Contents", "Bookmark", "Read aloud", "Notes", "Appearance", "Focus"]);
});

test("focus: every bar and tool goes away, only the book is left, and they come back", async ({ page, isMobile }) => {
  await openSample(page);
  const bars = [page.locator(".reader-top"), page.locator(".float-tools"), ...(isMobile ? [page.locator(".dock")] : [])];
  const gone = async () => { for (const bar of bars) await expect(bar).toHaveCSS("opacity", "0"); };
  const back = async () => { for (const bar of bars) await expect(bar).toHaveCSS("opacity", "1"); };

  await page.getByRole("button", { name: "Focus: only the book" }).click();
  await gone();
  await expect(page.locator(".toast")).toContainText("Only the book.");
  // The page is still there, and nothing of the tools can be pressed by accident.
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator(".reader-top")).toHaveCSS("pointer-events", "none");
  // The quiet button in the corner brings everything back.
  await page.getByRole("button", { name: "Show the tools" }).click();
  await back();
  await expect(page.getByRole("button", { name: "Show the tools" })).toHaveCount(0);

  if (!isMobile) {
    // Keys: F goes in and out, Esc goes out.
    await page.keyboard.press("f");
    await gone();
    await page.keyboard.press("Escape");
    await back();
    await page.keyboard.press("f");
    await gone();
    await page.keyboard.press("f");
    await back();
  }
  // It is also a card in "All tools", and it closes a mode that was on.
  await page.getByRole("button", { name: "Highlight text" }).click();
  await expect(page.locator(".mode-hint")).toBeVisible();
  await page.getByRole("button", { name: "All tools" }).click();
  await page.getByRole("dialog", { name: "All tools" }).getByRole("button", { name: /^Focus: only the book/ }).click();
  await gone();
  await expect(page.locator(".mode-hint")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("focus in an e-book: the bars go away and come back", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a PDF/ }).click();
  await (await chooser).setFiles("test/fixtures/sample.epub");
  await page.getByRole("list", { name: "Books" }).getByText("The Lighthouse Ledger").click();
  await expect(page.locator(".ebook-title small")).toHaveText("One: The Keeper");
  const height = async () => (await page.locator(".ebook-page").boundingBox())!.height;
  const before = await height();
  await page.getByRole("button", { name: "Focus: only the book" }).click();
  await expect(page.locator(".ebook-top")).toBeHidden();
  await expect(page.locator(".ebook-foot")).toBeHidden();
  expect(await height()).toBeGreaterThan(before + 60); // the book takes the room of the bars
  await page.getByRole("button", { name: "Show the tools" }).click();
  await expect(page.locator(".ebook-top")).toBeVisible();
  await expect(page.locator(".ebook-foot")).toBeVisible();
});
