import { chromium, expect, test, type Page } from "@playwright/test";

// The folder picker is a window of the system, which a test cannot press. It is replaced by one that hands
// over a folder in the browser's own private storage: a real folder handle, with real files.
const fakePicker = () => {
  Object.defineProperty(window, "showDirectoryPicker", {
    configurable: true,
    value: async () => (await navigator.storage.getDirectory()).getDirectoryHandle("Shared", { create: true }),
  });
};

type Entry = { path: string; data: string };
/** Every file of the shared folder, to carry it to the other computer as a cloud service would. */
const readFolder = (page: Page) => page.evaluate(async () => {
  const out: { path: string; data: string }[] = [];
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, item] of (dir as never as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (item.kind === "directory") await walk(item as FileSystemDirectoryHandle, `${prefix}${name}/`);
      else {
        const bytes = new Uint8Array(await (await (item as FileSystemFileHandle).getFile()).arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        out.push({ path: `${prefix}${name}`, data: btoa(text) });
      }
    }
  };
  await walk(await (await navigator.storage.getDirectory()).getDirectoryHandle("Shared", { create: true }), "");
  return out;
});
const writeFolder = (page: Page, entries: Entry[]) => page.evaluate(async (files) => {
  const root = await (await navigator.storage.getDirectory()).getDirectoryHandle("Shared", { create: true });
  for (const { path, data } of files) {
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create: true });
    const out = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
    await out.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
    await out.close();
  }
}, entries);

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

const card = (page: Page) => page.locator("#set-sync");
const openSettings = async (page: Page) => {
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(card(page)).toBeVisible();
};

test("two computers share a library through a folder", async ({ browserName, baseURL }) => {
  test.skip(browserName !== "chromium", "folder access exists in Chrome and Edge");
  // Each computer is a browser profile of its own, kept on disk: the test browser's private windows
  // crash when a folder handle is read back from storage, which a normal profile does not.
  const profile = (name: string) => chromium.launchPersistentContext(test.info().outputPath(name), { baseURL, viewport: { width: 1280, height: 800 } });
  const one = await profile("computer-1");
  const page = await one.newPage();
  await page.addInitScript(fakePicker);
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await select(page, "colored words keep their hue");
  await page.getByRole("toolbar", { name: "Selected text" }).locator(".swatch").first().click();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);
  await page.getByRole("button", { name: "Back to library" }).click();

  // The first computer chooses the folder: its book goes in.
  await openSettings(page);
  await expect(card(page)).toContainText("Choose a folder that your computers share");
  await card(page).getByRole("button", { name: "Choose a folder" }).click();
  await expect(card(page)).toContainText("Folder: Shared");
  await expect(card(page)).toContainText("1 book put in the folder. No other computer has used this folder yet.");
  const first = await readFolder(page);
  expect(first.map((f) => f.path.replace(/[0-9a-f]{64}|[0-9a-f-]{36}/, "*")).sort()).toEqual(["Reader343/books/*.pdf", "Reader343/covers/*", "Reader343/state/*.json"]);

  // The second computer: an empty library and the same folder, as its cloud service delivered it.
  const other = await profile("computer-2");
  const second = await other.newPage();
  await second.addInitScript(fakePicker);
  await second.goto("./");
  await writeFolder(second, first);
  await openSettings(second);
  await card(second).getByRole("button", { name: "Choose a folder" }).click();
  await expect(card(second)).toContainText("1 book received. 1 mark received.");
  await second.getByRole("button", { name: "Back to library" }).click();
  await second.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(second.locator('.page[data-page="1"] .hl')).toHaveCount(1);

  // There the highlight is removed and a page is bookmarked; the next round carries both back.
  await second.getByRole("button", { name: "Notes and highlights" }).click();
  await second.locator(".notes-panel").getByRole("tab", { name: /Highlights 1/ }).click();
  await second.locator(".notes-panel").getByRole("button", { name: "Remove highlight on page 1" }).click();
  await expect(second.locator('.page[data-page="1"] .hl')).toHaveCount(0);
  await second.locator('[data-tool="bookmark"]').click();
  await second.getByRole("button", { name: "Back to library" }).click();
  await openSettings(second);
  await card(second).getByRole("button", { name: "Sync now" }).click();
  await expect(card(second)).not.toContainText("received");
  await expect(card(second)).toContainText("Last synced");
  const back = await readFolder(second);
  await other.close();

  await writeFolder(page, back);
  // The folder is remembered after the app is opened again.
  await page.reload();
  await expect(card(page)).toContainText("Folder: Shared");
  await card(page).getByRole("button", { name: "Sync now" }).click();
  await expect(card(page)).toContainText("1 mark received. 1 removed here, as on another computer.");
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByRole("list", { name: "Books" }).getByText("Reader343 sample").click();
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(0);
  await expect(page.locator('[data-tool="bookmark"]')).toHaveAccessibleName("Remove bookmark");

  // Stopping forgets the folder and leaves its files.
  await page.getByRole("button", { name: "Back to library" }).click();
  await openSettings(page);
  await card(page).getByRole("button", { name: "Stop syncing" }).click();
  await expect(card(page).getByRole("button", { name: "Choose a folder" })).toBeVisible();
  expect((await readFolder(page)).length).toBeGreaterThanOrEqual(4);
  await one.close();
});

test("where folders cannot be reached, the card says what to do instead", async ({ page }) => {
  await page.addInitScript(() => { delete (window as never as { showDirectoryPicker?: unknown }).showDirectoryPicker; });
  await page.goto("./#/settings");
  await expect(card(page)).toContainText("Folder sync needs Chrome or Edge on a computer, or the desktop app.");
  await expect(card(page).getByRole("button")).toHaveCount(0);
});
