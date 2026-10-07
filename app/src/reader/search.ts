import { toTextContent, type OcrPage } from "../ocr/text";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Search inside a book. Each page's text is read once from pdf.js and kept, so
 * a second search is instant. Matching ignores case, accents and Arabic
 * diacritics, treats any run of spaces or a line break as one space, and
 * joins a word that was split with a hyphen at the end of a line.
 */

/** Text of a page as pdf.js gives it: one item per run of text, in reading order. */
export type TextItem = { str: string; hasEOL?: boolean; transform?: number[]; height?: number };

export type PageIndex = {
  /** The page's text: items joined, with "\n" after an item that ends a line. */
  text: string;
  /** Where each item sits in `text`, and how far down the page it is (0 top, 1 bottom). */
  items: { start: number; end: number; y: number }[];
  folded: string;
  /** For each character of `folded`, its position in `text`; one extra entry for the end. */
  map: number[];
};

export type Match = {
  page: number;
  /** Position in the page's text. */
  start: number;
  end: number;
  /** How far down the page the match starts, 0..1. */
  y: number;
  /** The pieces of the match, per text item, for drawing it on the page. */
  parts: { item: number; from: number; to: number }[];
  before: string;
  hit: string;
  after: string;
};

const ARABIC: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ئ": "ي", "ؤ": "و", "ة": "ه" };

/** Text reduced to what counts for matching, with a map back to the original positions. */
export function fold(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  let space = true; // leading spaces are dropped
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const next = i + ch.length;
    // "exam-" at the end of a line and "ple" on the next one read as "example".
    if (ch === "-" && /^[ \t]*\n\s*\p{Ll}/u.test(text.slice(next, next + 8))) {
      i = next + text.slice(next).search(/\S/);
      continue;
    }
    if (/\s/.test(ch)) {
      if (!space) {
        folded += " ";
        map.push(i);
        space = true;
      }
    } else if (ch !== "ـ") { // Arabic tatweel only stretches a word
      const plain = (ARABIC[ch] ?? ch).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
      for (const c of plain) {
        folded += c;
        for (let k = 0; k < c.length; k++) map.push(i);
        space = false;
      }
    }
    i = next;
  }
  if (folded.endsWith(" ")) {
    folded = folded.slice(0, -1);
    map.pop();
  }
  map.push(text.length);
  return { folded, map };
}

/** Builds the searchable form of a page. `yOf` gives how far down the page an item is. */
export function indexPage(items: TextItem[], yOf: (item: TextItem) => number = () => 0): PageIndex {
  let text = "";
  const places: PageIndex["items"] = [];
  for (const item of items) {
    const start = text.length;
    text += item.str;
    places.push({ start, end: text.length, y: yOf(item) });
    if (item.hasEOL) text += "\n";
  }
  return { text, items: places, ...fold(text) };
}

const SNIPPET = 40;

/** Every place `query` appears on a page. */
export function findInPage(index: PageIndex, query: string, page: number): Match[] {
  const needle = fold(query).folded;
  const matches: Match[] = [];
  if (!needle) return matches;
  for (let at = index.folded.indexOf(needle); at !== -1; at = index.folded.indexOf(needle, at + needle.length)) {
    const start = index.map[at];
    // The end is just after the last matched character, not at the start of what follows.
    const last = index.map[at + needle.length - 1];
    let end = last + String.fromCodePoint(index.text.codePointAt(last)!).length;
    // Marks that belong to the last letter (accents, Arabic vowel signs) are part of the match.
    while (end < index.text.length && /[\p{M}ـ]/u.test(index.text[end])) end++;
    const parts: Match["parts"] = [];
    let y = 0;
    index.items.forEach((item, i) => {
      if (item.end <= start || item.start >= end) return;
      if (!parts.length) y = item.y;
      parts.push({ item: i, from: Math.max(start, item.start) - item.start, to: Math.min(end, item.end) - item.start });
    });
    const tidy = (s: string) => s.replace(/\s+/g, " ");
    matches.push({
      page, start, end, y, parts,
      before: tidy(index.text.slice(Math.max(0, start - SNIPPET), start)).trimStart(),
      hit: tidy(index.text.slice(start, end)),
      after: tidy(index.text.slice(end, end + SNIPPET)).trimEnd(),
    });
  }
  return matches;
}

export const MAX_MATCHES = 2000;

/** Searches one open PDF. Pages are read as they are needed and remembered. */
export class BookSearch {
  private pages = new Map<number, Promise<PageIndex>>();

  /** `recognized` gives the text that was recognized on a scanned page, which then counts as the page's text. */
  constructor(private doc: PDFDocumentProxy, private recognized: (page: number) => OcrPage | undefined = () => undefined) {}

  /** Forget what was read of a page, after its text changed (it was just recognized). */
  forget(n: number) {
    this.pages.delete(n);
  }

  /** The searchable text of a page (1-based). */
  page(n: number): Promise<PageIndex> {
    let index = this.pages.get(n);
    if (!index) {
      index = (async () => {
        const page = await this.doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        // Same options as the text layer on screen, so item numbers line up with its elements.
        const scanned = this.recognized(n);
        const content = scanned?.lines.length ? toTextContent(scanned, viewport) : await page.getTextContent({ disableNormalization: true });
        const items = (content.items as TextItem[]).filter((item) => item.str !== undefined);
        return indexPage(items, (item) => {
          if (!item.transform) return 0;
          const [, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5] + (item.height ?? 0));
          return Math.min(1, Math.max(0, y / viewport.height));
        });
      })();
      index.catch(() => this.pages.delete(n));
      this.pages.set(n, index);
    }
    return index;
  }

  /**
   * Looks for `query` on every page, in order, and reports as it goes.
   * Returns a function that stops the search.
   */
  run(query: string, onUpdate: (matches: Match[], pagesDone: number, done: boolean) => void): () => void {
    let stopped = false;
    const total = this.doc.numPages;
    (async () => {
      const matches: Match[] = [];
      let lastReport = performance.now();
      for (let n = 1; n <= total && !stopped && matches.length < MAX_MATCHES; n++) {
        const index = await this.page(n).catch(() => null);
        if (stopped) return;
        if (index) matches.push(...findInPage(index, query, n));
        // Show what was found so far a few times a second, and let the page breathe.
        if (performance.now() - lastReport > 150) {
          onUpdate(matches.slice(0, MAX_MATCHES), n, false);
          lastReport = performance.now();
          await new Promise((r) => setTimeout(r, 0));
        }
      }
      if (!stopped) onUpdate(matches.slice(0, MAX_MATCHES), total, true);
    })();
    return () => {
      stopped = true;
    };
  }
}
