import { expect, test, type Page } from "@playwright/test";

async function addBook(page: Page, file: string) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles(file);
}

/**
 * The frame that holds the section of the book on screen. foliate-js keeps it in a closed shadow tree,
 * which selectors cannot enter, so it is found among the page's frames: its address starts with "blob:".
 * Going to another chapter makes a new frame, so tests wait with `shown` before they look into it.
 */
const section = (page: Page) => page.frames().filter((f) => f.url().startsWith("blob:")).at(-1) ?? page.mainFrame();
/** Waits until these words are on screen in the book. */
const shown = (page: Page, text: string) => expect.poll(async () => {
  for (const frame of page.frames().filter((f) => f.url().startsWith("blob:"))) {
    if (await frame.getByText(text).first().isVisible().catch(() => false)) return true;
  }
  return false;
}, { message: `"${text}" on screen in the book` }).toBe(true);
const percent = (page: Page) => page.locator(".ebook-percent");

async function openBook(page: Page, file: string, title: string) {
  await addBook(page, file);
  await page.getByRole("list", { name: "Books" }).getByText(title).click();
  await expect(page.locator(".ebook-title strong")).toHaveText(title);
  await expect.poll(() => section(page).locator("h1").isVisible().catch(() => false)).toBe(true);
}

async function select(page: Page, text: string) {
  await section(page).locator("p", { hasText: text }).first().evaluate((p, t) => {
    const node = [...p.childNodes].find((n) => n.nodeType === 3 && n.textContent!.includes(t))!;
    const range = p.ownerDocument.createRange();
    range.setStart(node, node.textContent!.indexOf(t));
    range.setEnd(node, node.textContent!.indexOf(t) + t.length);
    const sel = p.ownerDocument.defaultView!.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}

test("an EPUB is added with its title, author and cover, and opens in the e-book reader", async ({ page }) => {
  await addBook(page, "test/fixtures/sample.epub");
  const card = page.getByRole("list", { name: "Books" }).getByRole("listitem").first();
  await expect(card).toContainText("The Lighthouse Ledger");
  await expect(card).toContainText("Mara Quill");
  await expect(card.locator(".cover img")).toHaveJSProperty("complete", true);
  expect(await card.locator(".cover img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(50);

  await card.getByText("The Lighthouse Ledger").click();
  await expect(page.locator(".ebook-title strong")).toHaveText("The Lighthouse Ledger");
  await shown(page, "One: The Keeper");
  await expect(section(page).locator("h1")).toHaveText("One: The Keeper");
  await shown(page, "The first chapter opens with a walrus on the rocks.");
  await expect(page.locator(".ebook-title small")).toHaveText("One: The Keeper");
  // The page on screen counts as read, so the first page of a short book is already some percent.
  await expect(percent(page)).toHaveText(/^\d+%$/);
  expect(parseInt((await percent(page).textContent())!)).toBeLessThan(25);
  // The same file again is the same book.
  await page.getByRole("button", { name: "Back to library" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await chooser).setFiles("test/fixtures/sample.epub");
  await expect(page.getByText("“The Lighthouse Ledger” is already in your library.")).toBeVisible();
});

test("pages turn, the contents jump, and the book opens again where it was left", async ({ page }) => {
  await openBook(page, "test/fixtures/sample.epub", "The Lighthouse Ledger");
  const first = await percent(page).textContent();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(percent(page)).not.toHaveText(first!);
  const afterOne = await percent(page).textContent();
  await page.waitForTimeout(250); // a page turn must end before the next one is taken
  await page.keyboard.press("ArrowRight");
  await expect(percent(page)).not.toHaveText(afterOne!);
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(percent(page)).toHaveText(afterOne!);

  // Contents: chapters, with a part of chapter two under it.
  await page.getByRole("button", { name: "Contents" }).click();
  const contents = page.getByRole("dialog", { name: "Contents" });
  await expect(contents.getByRole("button")).toHaveText(["", "One: The Keeper", "Two: The Storm", "After the storm", "Three: The Ledger"]);
  await contents.getByRole("button", { name: "After the storm" }).click();
  await expect(contents).toHaveCount(0);
  await shown(page, "a single zeppelin crossed the sky");
  await expect(page.locator(".ebook-title small")).toHaveText("After the storm");
  const place = await percent(page).textContent();
  expect(parseInt(place!)).toBeGreaterThan(40);

  // Leaving and coming back: the same place. The library shows how far the reader is.
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByRole("list", { name: "Books" }).getByRole("progressbar")).toHaveAttribute("aria-valuenow", String(parseInt(place!)));
  await page.reload();
  await page.getByRole("list", { name: "Books" }).getByText("The Lighthouse Ledger").click();
  await shown(page, "a single zeppelin crossed the sky");
  await expect(percent(page)).toHaveText(place!);

  // The slider goes anywhere in the book.
  await page.locator(".ebook-slider").fill("1000");
  await shown(page, "The end.");
  await expect(percent(page)).toHaveText("100%");
});

test("words are found across chapters", async ({ page }) => {
  await openBook(page, "test/fixtures/sample.epub", "The Lighthouse Ledger");
  await page.getByRole("button", { name: "Search" }).click();
  const search = page.getByRole("dialog", { name: "Search in the book" });
  await search.getByRole("searchbox").fill("zeppelin");
  await search.getByRole("button", { name: "Search" }).click();
  await expect(search).toContainText("1 matches");
  await expect(search.locator(".ebook-found h3")).toHaveText("Two: The Storm");
  await search.locator(".ebook-found button").click();
  await shown(page, "a single zeppelin crossed the sky");
  await page.getByRole("button", { name: "Search" }).click();
  await search.getByRole("searchbox").fill("green ledger");
  await search.getByRole("searchbox").press("Enter");
  await expect(search).toContainText("1 matches");
  await search.getByRole("searchbox").fill("xylophone");
  await search.getByRole("searchbox").press("Enter");
  await expect(search).toContainText("No matches");
});

test("a passage is highlighted, a note is written, a page is bookmarked, and all three are listed and kept", async ({ page }) => {
  await openBook(page, "test/fixtures/sample.epub", "The Lighthouse Ledger");
  await select(page, "a walrus on the rocks");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").nth(1).click();
  await expect(page.locator(".selection-bar")).toHaveCount(0);
  await select(page, "counted the ships each evening");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".sel-action").last().click();
  await page.locator(".pop-title").fill("Habit");
  await page.locator(".pop-note textarea").fill("He never misses a day.");
  await page.locator(".pop-actions .btn-primary").click();
  await expect(page.locator(".pop-note")).toHaveCount(0);
  await page.getByRole("button", { name: "Bookmark this page" }).click();
  await expect(page.getByRole("button", { name: "Remove bookmark" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Notes and highlights" }).click();
  const list = page.getByRole("dialog", { name: "Notes and highlights" });
  await expect(list.locator(".ebook-mark")).toHaveCount(3);
  await expect(list).toContainText("a walrus on the rocks");
  await expect(list).toContainText("Habit: He never misses a day.");
  await list.getByRole("button", { name: "Close" }).click();

  // After a reload everything is still there, and the notebook of all books has the two marks.
  await page.reload(); // the address is the book's: it opens again
  await expect(page.locator(".ebook-title strong")).toHaveText("The Lighthouse Ledger");
  await shown(page, "One: The Keeper");
  await page.getByRole("button", { name: "Notes and highlights" }).click();
  await expect(list.locator(".ebook-mark")).toHaveCount(3);
  await list.getByRole("button", { name: "Remove highlight" }).click();
  await expect(list.locator(".ebook-mark")).toHaveCount(2);
  await list.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("button", { name: "Notebook" }).click();
  await expect(page.locator(".notebook")).toContainText("He never misses a day.");
  await expect(page.locator(".notebook")).not.toContainText("a walrus on the rocks");
});

test("smart dark turns the page dark, and the text size changes", async ({ page }) => {
  await openBook(page, "test/fixtures/sample.epub", "The Lighthouse Ledger");
  // Smart dark is the app's default page style: the frame is inverted with its hues kept.
  await expect(page.locator(".ebook")).toHaveAttribute("data-page-style", "dark");
  // The paper is the theme's dark gray: a point in the page's margin is dark on the screen.
  const paperIsDark = async () => {
    const paper = (await page.locator(".ebook-page").boundingBox())!; // under the bar, whatever its height
    const shot = await page.screenshot({ clip: { x: paper.x + 8, y: paper.y + 12, width: 4, height: 4 } });
    return page.evaluate(async (data) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
      const canvas = new OffscreenCanvas(4, 4);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      const [r, g, b] = canvas.getContext("2d")!.getImageData(1, 1, 1, 1).data;
      return r + g + b < 200;
    }, shot.toString("base64"));
  };
  expect(await paperIsDark()).toBe(true);
  const size = () => section(page).locator("html").evaluate((html) => parseFloat(getComputedStyle(html).fontSize));
  const before = await size();
  await page.getByRole("button", { name: "Appearance" }).click();
  const look = page.getByRole("dialog", { name: "Appearance" });
  await look.getByRole("button", { name: "Larger text" }).click();
  await expect(look.locator("output")).toHaveText("110%");
  await expect.poll(size).toBeGreaterThan(before);
  await look.getByText("Original").click();
  await expect(page.locator(".ebook")).toHaveAttribute("data-page-style", "original");
  await look.getByRole("button", { name: "Close" }).click();
  expect(await paperIsDark()).toBe(false);
  await page.getByRole("button", { name: "Appearance" }).click();
  await look.getByText("Scrolling").click();
  await look.getByRole("button", { name: "Close" }).click();
  // One long scroll: the end of the chapter is in the same frame, further down.
  await expect(section(page).getByText("Paragraph 30.")).toBeAttached();
});

test("a script inside a book does not run", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openBook(page, "test/fixtures/scripted.epub", "A Book With a Script");
  await expect(section(page).locator("#words")).toHaveText("These words are harmless.");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as never as { scriptRan?: boolean }).scriptRan)).toBeUndefined();
  expect(errors).toEqual([]);
});

test("an Arabic book reads right to left", async ({ page }) => {
  await openBook(page, "test/fixtures/arabic.epub", "دفتر الفنار");
  await expect(section(page).locator("h1")).toHaveText("الفصل الأول");
  expect(await section(page).locator("html").evaluate((html) => getComputedStyle(html).direction)).toBe("rtl");
  const first = await percent(page).textContent();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(percent(page)).not.toHaveText(first!);
  // The left arrow goes forward in a book that runs right to left.
  const at = await percent(page).textContent();
  await page.waitForTimeout(250);
  await page.keyboard.press("ArrowLeft");
  await expect(percent(page)).not.toHaveText(at!);
});

test("read aloud speaks the book from the page on screen, block after block", async ({ page }) => {
  // A stand-in for the device's voices that writes down what it is asked to say.
  await page.addInitScript(() => {
    const said: string[] = [];
    (window as never as { said: string[] }).said = said;
    const synth = {
      speaking: false, onvoiceschanged: null, pause() {}, resume() {},
      cancel() { said.push("(stopped)"); },
      getVoices: () => [{ voiceURI: "a", name: "Samantha (Enhanced)", lang: "en-US", localService: true }],
      speak(u: { text: string; onend: (() => void) | null }) { said.push(u.text); setTimeout(() => u.onend?.(), 30); },
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    class Utterance { rate = 1; pitch = 1; lang = ""; voice = null; onend = null; constructor(public text: string) {} }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  });
  await openBook(page, "test/fixtures/sample.epub", "The Lighthouse Ledger");
  await page.getByRole("button", { name: "Read aloud" }).click();
  await expect(page.getByRole("button", { name: "Pause reading" })).toBeVisible();
  const said = () => page.evaluate(() => (window as never as { said: string[] }).said);
  await expect.poll(async () => (await said()).length).toBeGreaterThan(3);
  const heard = await said();
  expect(heard[0]).toBe("One: The Keeper");
  expect(heard[1]).toBe("The first chapter opens with a walrus on the rocks.");
  expect(heard[2]).toMatch(/^Paragraph 1\. The lighthouse keeper counted the ships/);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("button", { name: "Read aloud" })).toBeVisible();
  const count = (await said()).filter((s) => s !== "(stopped)").length;
  await page.waitForTimeout(200);
  expect((await said()).filter((s) => s !== "(stopped)").length).toBe(count); // nothing more is said after Stop
});
