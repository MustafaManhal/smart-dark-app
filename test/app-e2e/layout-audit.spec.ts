import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

// Walks through every state of the reader, the notes panel, the sheets, the stats and the
// settings at phone, tablet and desktop widths, in English and Arabic. In each state it
// looks for console errors, sideways scrolling, controls that leave the screen, controls
// hidden under something else, and labels that spill out of their button. Screenshots of
// every state go to test/output/audit/ for a look by eye.
// AUDIT_WEBKIT=1 runs it in the WebKit iPhone project too.
test.skip(({ browserName }) => browserName !== "chromium" && !process.env.AUDIT_WEBKIT, "audit runs in Chromium");
const out = process.env.AUDIT_WEBKIT ? "test/output/audit-webkit" : "test/output/audit";
test.use({ serviceWorkers: "block" });

const SIZES: [number, number][] = [[320, 640], [390, 844], [768, 1024], [1280, 800]];
mkdirSync(out, { recursive: true });

type Finding = { where: string; kind: string; detail: string };

async function check(page: Page, where: string, findings: Finding[]) {
  await page.waitForTimeout(350);
  const found = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const res: { kind: string; detail: string }[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""}[${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}]`;
    if (document.documentElement.scrollWidth > vw + 1) res.push({ kind: "page scrolls sideways", detail: `${document.documentElement.scrollWidth} > ${vw}` });
    // The app fills the window: a margin around the page means a base rule was lost.
    const edge = getComputedStyle(document.body).margin;
    if (edge !== "0px") res.push({ kind: "margin around the app", detail: edge });
    // The layer on top: a sheet, else the whole page.
    const backdrop = document.querySelector<HTMLElement>(".panel-backdrop");
    const panelModal = backdrop && getComputedStyle(backdrop).display !== "none" ? document.querySelector(".notes-panel") : null;
    const modal = [...document.querySelectorAll(".sheet-backdrop, .palette-backdrop")].at(-1) ?? panelModal ?? null;
    const scope = modal ?? document.body;
    const controls = [...scope.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")];
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.pointerEvents === "none") continue;
      // Things inside scrolling areas may be off screen on purpose.
      const scroller = el.closest(".reader-scroll, .sheet, .notes-panel .panel-body, .voice-list, .search-results, .zoom-chips, .chips, .heat-scroll, .pop-quote, .panel-tabs, .toc");
      const inPage = el.closest(".page");
      if (!scroller || el.closest(".float-tools, .reader-top, .read-bar, .selection-bar, .popover, .toast, .mode-hint, .place-hint, .search-row")) {
        if (r.right > vw + 1 || r.left < -1) res.push({ kind: "outside screen (x)", detail: `${name(el)} ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}` });
        if (!inPage && (r.bottom > vh + 1 || r.top < -1) && getComputedStyle(el.closest(".settings, .library, .stats") ?? document.body).position !== "static")
          res.push({ kind: "outside screen (y)", detail: `${name(el)} ${Math.round(r.top)}..${Math.round(r.bottom)} of ${vh}` });
      }
      if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      if (inPage) continue;
      // A control whose middle is under the fold of a sheet is reached by scrolling the sheet.
      if (el.closest(".sheet") && r.top + r.height / 2 > vh - 1) continue;
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (!top) continue;
      if (el.contains(top) || top === el) continue;
      if (top.closest("label")?.contains(el)) continue; // visually hidden radio inside its label
      if (el.closest(".sheet") && !top.closest(".sheet-backdrop")) { res.push({ kind: "covered", detail: `${name(el)} under ${name(top)}` }); continue; }
      // Scrolled out of its sheet (above the top edge or under the fold) is fine.
      const sheetBox = el.closest(".sheet")?.getBoundingClientRect();
      if (sheetBox && (cy < sheetBox.top || cy > sheetBox.bottom)) continue;
      if (scroller && !el.closest(".float-tools")) {
        // clipped by its scroller is fine
        const s = scroller.getBoundingClientRect();
        if (cy < s.top || cy > s.bottom || cx < s.left || cx > s.right) continue;
      }
      res.push({ kind: "covered", detail: `${name(el)} under ${name(top)}` });
    }
    // Floating bars are small things. One that fills the screen has conflicting rules.
    for (const el of document.querySelectorAll<HTMLElement>(".selection-bar, .toast, .mode-hint, .place-hint, .read-bar, .zoom-menu, .float-tools > *")) {
      const r = el.getBoundingClientRect();
      if (r.height > vh * 0.6 || (r.height > 120 && !el.matches(".zoom-menu"))) res.push({ kind: "stretched", detail: `${name(el)} is ${Math.round(r.height)}px tall` });
    }
    const bar = document.querySelector(".read-bar")?.getBoundingClientRect();
    for (const el of document.querySelectorAll<HTMLElement>(".selection-bar, .popover, .toast")) {
      const r = el.getBoundingClientRect();
      if (bar && r.width && r.bottom > bar.top + 1 && r.top < bar.bottom && r.right > bar.left && r.left < bar.right)
        res.push({ kind: "over the read-aloud bar", detail: name(el) });
    }
    // Text cut off inside buttons and chips.
    for (const el of scope.querySelectorAll<HTMLElement>("button, .chip, .zoom-chip, .seg label, .voice-detail, h1, h2, legend")) {
      if (!el.offsetWidth) continue;
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === "visible" && !el.closest(".page"))
        res.push({ kind: "text spills", detail: `${name(el)} ${el.scrollWidth} > ${el.clientWidth}` });
    }
    // Words must stand out from what is behind them: 4.5 to 1, or 3 to 1 for large letters (WCAG AA).
    const parse = (c: string): number[] | null => {
      const m = c.match(/^rgba?\(([^)]+)\)/);
      if (m) {
        const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        return [r, g, b, a];
      }
      const k = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/);
      return k ? [+k[1] * 255, +k[2] * 255, +k[3] * 255, k[4] === undefined ? 1 : +k[4]] : null;
    };
    const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
    const groundOf = (el: Element) => {
      const stack: number[][] = [];
      for (let n: Element | null = el; n; n = n.parentElement) {
        const style = getComputedStyle(n);
        if (style.backgroundImage !== "none") return null; // a picture or gradient: not judged here
        const c = parse(style.backgroundColor);
        if (c && c[3] > 0) {
          stack.push(c);
          if (c[3] >= 0.999) break;
        }
      }
      return stack.reverse().reduce((under, c) => over(c, under), [255, 255, 255, 1]);
    };
    const light = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const seen = new Set<string>();
    for (const el of scope.querySelectorAll<HTMLElement>("*")) {
      if (el.closest(".page, .sticky, .quote-view, .cover, .resume-cover, .heat, canvas, svg, mark, kbd, [aria-hidden='true']")) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent!.trim()).join(" ").trim();
      if (text.length < 2) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || el.closest(":disabled, [aria-disabled='true']")) continue;
      let faded = false;
      for (let n: Element | null = el; n; n = n.parentElement) if (+getComputedStyle(n).opacity < 0.99) faded = true;
      if (faded) continue;
      const ground = groundOf(el);
      const ink = parse(style.color);
      if (!ground || !ink) continue;
      const a = light(over(ink, ground)), b = light(ground);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const size = parseFloat(style.fontSize);
      const need = size >= 24 || (size >= 18.66 && +style.fontWeight >= 700) ? 3 : 4.5;
      if (ratio >= need - 0.05) continue;
      const key = `${el.tagName}.${el.className}|${ratio.toFixed(1)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      res.push({ kind: "low contrast", detail: `${name(el)} ${ratio.toFixed(2)} of ${need} (${style.color} on rgb(${ground.slice(0, 3).map(Math.round).join(" ")}))` });
    }
    return res;
  });
  for (const f of found) findings.push({ where, ...f });
  await page.screenshot({ path: `${out}/${where}.png` });
}

async function selectText(page: Page, text: string) {
  await page.locator(".textLayer span", { hasText: text }).first().evaluate((span, t) => {
    const node = span.firstChild!;
    const start = node.textContent!.indexOf(t);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + t.length);
    const sel = getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}

// "dark" is English with the app's dark theme: the same walk, mostly for the contrast of every piece.
for (const variant of ["en", "ar", "dark"] as const) {
  const lang = variant === "ar" ? "ar" : "en";
  for (const [width, height] of SIZES) {
    if (variant === "ar" && width !== 320 && width !== 1280) continue;
    if (variant === "dark" && width !== 390 && width !== 1280) continue;
    test(`audit ${variant} ${width}`, async ({ page }) => {
      test.setTimeout(180_000);
      const findings: Finding[] = [];
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));
      await page.addInitScript(() => {
        // A quiet stand-in for the device voices.
        const synth = { speaking: false, onvoiceschanged: null, speak() {}, cancel() {},
          getVoices: () => [
            { voiceURI: "a", name: "Samantha (Enhanced)", lang: "en-US", localService: true },
            { voiceURI: "b", name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
            { voiceURI: "c", name: "Daniel", lang: "en-GB", localService: true },
          ] };
        Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
        class Utterance { rate = 1; pitch = 1; lang = ""; voice = null; onend = null; onerror = null; constructor(public text: string) {} }
        Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
      });
      await page.setViewportSize({ width, height });
      const tag = `${variant}-${width}`;
      const T = (en: string, ar: string) => (lang === "ar" ? ar : en);
      await page.goto("./");
      if (variant === "dark") {
        await page.getByRole("button", { name: "Settings" }).click();
        await page.getByRole("radio", { name: "Dark" }).first().check();
        await page.getByRole("button", { name: "Back to library" }).click();
      }
      if (lang === "ar") {
        await page.getByRole("button", { name: "Settings" }).click();
        await page.getByRole("radio", { name: "العربية" }).check();
        await page.getByRole("button", { name: "العودة إلى المكتبة" }).click();
      }
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: /Add PDF|Choose a PDF|إضافة PDF|اختر ملف PDF/ }).first().click();
      await (await chooser).setFiles("src/sample/sample.pdf");
      await expect(page.locator(".cover img")).toHaveJSProperty("complete", true);
      await check(page, `${tag}-01-library`, findings);

      await page.getByRole("list").getByText("Reader343 sample").click();
      await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
      await expect(page.locator(".zoom-chip").first()).toBeEnabled();
      await check(page, `${tag}-02-reader`, findings);

      await page.locator(".zoom-value").click();
      await check(page, `${tag}-03-zoom-menu`, findings);
      await page.locator(".zoom-value").click();

      // Search: the bar, the marks, the list of matches.
      await page.locator(".top-search").click();
      await page.locator(".search-row input").fill("the");
      await expect(page.locator(".found").first()).toBeVisible();
      await check(page, `${tag}-03b-search`, findings);
      await page.locator(".search-row .icon-btn").nth(2).click();
      await expect(page.locator(".search-results")).toBeVisible();
      await check(page, `${tag}-03c-search-list`, findings);
      await page.locator(".search-row .icon-btn").last().click();

      await selectText(page, "colored words keep their hue");
      await expect(page.locator(".selection-bar")).toBeVisible();
      await check(page, `${tag}-04-selection`, findings);
      await page.locator(".selection-bar .swatch").first().click();
      await expect(page.locator('.page[data-page="1"] .hl')).toHaveCount(1);

      const hl = (await page.locator('.page[data-page="1"] .hl').first().boundingBox())!;
      await page.mouse.click(hl.x + hl.width / 2, hl.y + hl.height / 2);
      await expect(page.locator(".popover")).toBeVisible();
      await check(page, `${tag}-05-highlight-menu`, findings);
      await page.locator(".reader-title").click();

      await selectText(page, "Black body text");
      await page.locator(".selection-bar .sel-action").last().click();
      await expect(page.locator(".pop-note")).toBeVisible();
      await page.locator(".pop-title").fill("A fairly long title for this note to see wrapping");
      await page.locator(".pop-note textarea").fill("Body of the note.\nSecond line.");
      await check(page, `${tag}-06-note`, findings);
      await page.locator(".pop-actions .btn-primary").click();

      await page.locator(".tools .icon-btn").nth(2).click(); // sticky note tool
      await check(page, `${tag}-07-place-hint`, findings);
      await page.mouse.click(width * 0.45, height * 0.72);
      await expect(page.locator(".sticky")).toBeVisible();
      await page.locator(".sticky-title").fill("Sticky title that is long enough");
      await page.locator(".sticky textarea").fill("Sticky text");
      await page.waitForTimeout(600);
      await page.locator(".reader-title").click();
      await check(page, `${tag}-08-sticky`, findings);

      await page.locator(".tools .icon-btn").nth(0).click(); // highlighter
      await check(page, `${tag}-09-highlight-mode`, findings);
      await page.locator(".tools .icon-btn").nth(1).click(); // eraser
      await check(page, `${tag}-10-eraser-mode`, findings);
      const hl2 = (await page.locator('.page[data-page="1"] .hl').first().boundingBox())!;
      await page.mouse.click(hl2.x + hl2.width / 2, hl2.y + hl2.height / 2);
      await expect(page.locator(".toast")).toBeVisible();
      await check(page, `${tag}-11-toast-undo`, findings);
      await page.locator(".toast button").click();
      await page.locator(".mode-done").click();

      await page.locator(".tools .icon-btn").nth(4).click(); // read aloud
      await expect(page.locator(".read-bar")).toBeVisible();
      await check(page, `${tag}-12-read-bar`, findings);
      await page.locator(".read-bar .icon-btn").nth(-2).click(); // its settings
      await expect(page.locator(".sheet")).toBeVisible();
      await check(page, `${tag}-13-read-sheet`, findings);
      await page.locator(".sheet").evaluate((s) => s.scrollTo(0, s.scrollHeight));
      await check(page, `${tag}-14-read-sheet-end`, findings);
      await page.locator(".sheet-head .icon-btn").click();
      // a sleep timer label in the bar
      await page.locator(".read-bar .icon-btn").nth(-2).click();
      await page.locator('.sheet input[name="sleep"]').nth(1).check({ force: true });
      await page.locator(".sheet-head .icon-btn").click();
      await check(page, `${tag}-15-read-bar-sleep`, findings);
      // Editing while read aloud is on: the selection bar, the highlight menu, the tool hints.
      await selectText(page, "Reader343 sample - toggle");
      await expect(page.locator(".selection-bar")).toBeVisible();
      await check(page, `${tag}-15b-reading-selection`, findings);
      await page.locator(".selection-bar .swatch").nth(1).click();
      const read = (await page.locator('.page[data-page="1"] .hl').last().boundingBox())!;
      await page.mouse.click(read.x + read.width / 2, read.y + read.height / 2);
      await expect(page.locator(".popover")).toBeVisible();
      await check(page, `${tag}-15c-reading-highlight-menu`, findings);
      await page.locator(".pop-action.is-danger").click();
      await expect(page.locator(".toast")).toBeVisible();
      await check(page, `${tag}-15d-reading-toast`, findings);
      await page.locator(".tools .icon-btn").nth(0).click(); // highlighter
      await check(page, `${tag}-15e-reading-highlight-mode`, findings);
      await page.locator(".mode-done").click();
      await page.locator(".read-bar .icon-btn").last().click();

      await page.locator(".tools .icon-btn").nth(7).click(); // appearance
      await expect(page.locator(".sheet")).toBeVisible();
      await check(page, `${tag}-16-appearance`, findings);
      await page.locator(".sheet").evaluate((s) => s.scrollTo(0, s.scrollHeight));
      await check(page, `${tag}-17-appearance-end`, findings);
      await page.locator(".sheet-head .icon-btn").click();

      // Crop margins: the page fills the width, nothing sticks out.
      await page.locator(".tools .icon-btn").nth(7).click();
      await page.locator(".sheet .toggle input").last().click();
      await expect(page.locator('.page[data-page="1"]')).toHaveClass(/is-cropped/);
      await check(page, `${tag}-17b-crop-sheet`, findings);
      await page.locator(".sheet-head .icon-btn").click();
      await check(page, `${tag}-17c-cropped`, findings);
      await page.locator(".tools .icon-btn").nth(7).click();
      await page.locator(".sheet .toggle input").last().click();
      await expect(page.locator('.page[data-page="1"]')).not.toHaveClass(/is-cropped/);
      await page.locator(".sheet-head .icon-btn").click();

      await page.locator(".tools .icon-btn").nth(6).click(); // contents
      await expect(page.locator(".sheet")).toBeVisible();
      await check(page, `${tag}-18-contents`, findings);
      await page.locator(".sheet-head .icon-btn").click();
      // A jump from the contents leaves a Back pill beside the page number.
      await page.locator(".tools .icon-btn").nth(6).click();
      await page.locator(".toc button").last().click();
      await expect(page.locator(".back-pill")).toBeVisible();
      await check(page, `${tag}-18a-back-pill`, findings);
      await page.locator(".back-pill").click();
      await expect(page.locator(".back-pill")).toHaveCount(0);
      await page.locator(".top-menu").click();
      await expect(page.locator(".book-menu")).toBeVisible();
      await check(page, `${tag}-18b-book-menu`, findings);
      // From the book menu: the command list, auto-scroll and (with a keyboard) the shortcut sheet.
      await page.locator(".book-menu button").first().click();
      await expect(page.locator(".palette")).toBeVisible();
      await check(page, `${tag}-18c-commands`, findings);
      await page.locator(".palette input").fill("page");
      await check(page, `${tag}-18d-commands-found`, findings);
      await page.keyboard.press("Escape");
      await page.locator(".top-menu").click();
      await page.locator(".book-menu button").nth(1).click();
      await expect(page.locator(".auto-bar")).toBeVisible();
      await page.locator(".auto-bar .read-play").click(); // hold still for the picture
      await check(page, `${tag}-18e-auto-scroll`, findings);
      await page.locator(".auto-bar .icon-btn").last().click();
      await page.keyboard.press("?");
      await expect(page.locator(".shortcuts")).toBeVisible();
      await check(page, `${tag}-18f-shortcuts`, findings);
      await page.locator(".sheet").evaluate((s) => s.scrollTo(0, s.scrollHeight));
      await check(page, `${tag}-18g-shortcuts-end`, findings);
      await page.locator(".sheet-head .icon-btn").click();
      await page.locator(".page-pill").click();
      await check(page, `${tag}-19-goto`, findings);
      await page.locator(".sheet-head .icon-btn").click();

      await page.locator(".tools .icon-btn").nth(5).click(); // notes panel
      await expect(page.locator(".notes-panel")).toBeVisible();
      await check(page, `${tag}-20-panel-highlights`, findings);
      await page.locator(".panel-tabs button").nth(1).click();
      await check(page, `${tag}-21-panel-notes`, findings);
      await page.locator(".panel-tabs button").nth(2).click();
      await check(page, `${tag}-22-panel-sticky`, findings);
      if (width >= 960) {
        // Wide screens keep the page beside the panel, so the tools still work there.
        await page.locator(".tools .icon-btn").nth(1).click(); // eraser
        await check(page, `${tag}-22b-panel-eraser-hint`, findings);
        const hint = (await page.locator(".mode-hint").boundingBox())!;
        const panel = (await page.locator(".notes-panel").boundingBox())!;
        if (hint.x < panel.x + panel.width && hint.x + hint.width > panel.x) findings.push({ where: `${tag}-22b`, kind: "hint under the notes panel", detail: `${Math.round(hint.x)}..${Math.round(hint.x + hint.width)} vs panel ${Math.round(panel.x)}..${Math.round(panel.x + panel.width)}` });
        await page.locator(".mode-done").click();
      }
      await page.locator(".panel-head .icon-btn").last().click();

      await page.locator(".top-back").click();
      await page.getByRole("button", { name: T("Reading stats", "إحصاءات القراءة") }).click();
      await check(page, `${tag}-23-stats`, findings);
      await page.locator(".icon-btn").first().click();
      await page.getByRole("button", { name: T("Settings", "الإعدادات") }).click();
      await check(page, `${tag}-24-settings`, findings);
      await page.evaluate(() => window.scrollTo(0, 500));
      await check(page, `${tag}-25-settings-mid`, findings);

      writeFileSync(`${out}/${tag}.json`, JSON.stringify({ errors, findings }, null, 1));
      expect([...new Set(errors)], "console errors").toEqual([]);
      expect(findings.map((f) => `${f.where} | ${f.kind} | ${f.detail}`), "layout problems").toEqual([]);
    });
  }
}
