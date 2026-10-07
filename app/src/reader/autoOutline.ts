import type { OutlineItem, PDFDocumentProxy } from "./pdf";

/** One line of a page: its words, the size of its letters, and how far down the page it is (0 top, 1 bottom). */
export type PageLine = { text: string; size: number; y: number };

/**
 * A table of contents for a book that has none, read from the size of its
 * letters: lines set clearly larger than the body text are headings, and the
 * larger the letters the higher the level. Lines that repeat on many pages at
 * the same height (running headers) and bare page numbers are left out.
 */
export function headingsFromPages(pages: { page: number; lines: PageLine[] }[]): OutlineItem[] {
  // The size most of the letters have is the body text.
  const letters = new Map<number, number>();
  for (const { lines } of pages) for (const l of lines) letters.set(round(l.size), (letters.get(round(l.size)) ?? 0) + l.text.length);
  const body = [...letters].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!body) return [];

  // Words at the same height on a third of the pages or more (and on three at least) are a header or footer, not a heading.
  const repeats = new Map<string, number>();
  for (const { lines } of pages) {
    for (const key of new Set(lines.map((l) => `${l.text.replace(/\d+/g, "#")}@${Math.round(l.y * 50)}`))) repeats.set(key, (repeats.get(key) ?? 0) + 1);
  }
  const running = (l: PageLine) => (repeats.get(`${l.text.replace(/\d+/g, "#")}@${Math.round(l.y * 50)}`) ?? 0) >= Math.max(3, pages.length / 3);

  const found: { page: number; text: string; size: number }[] = [];
  for (const { page, lines } of pages) {
    for (const l of lines) {
      const text = l.text.replace(/\s+/g, " ").trim();
      if (round(l.size) < body * 1.15 || text.length < 3 || text.length > 120) continue;
      if (!/\p{L}/u.test(text) || running(l)) continue;
      found.push({ page, text, size: round(l.size) });
    }
  }
  // A size used only once, on the first page, larger than every other, is the book's title: not a chapter.
  const sizes = [...new Set(found.map((f) => f.size))].sort((a, b) => b - a);
  const top = found.filter((f) => f.size === sizes[0]);
  const titleOnly = sizes.length > 1 && top.length === 1 && top[0].page === pages[0]?.page;
  const levels = (titleOnly ? sizes.slice(1) : sizes).slice(0, 3);
  return found
    .filter((f) => levels.includes(f.size))
    .slice(0, 500)
    .map((f) => ({ title: f.text, page: f.page, depth: levels.indexOf(f.size) }));
}

const round = (size: number) => Math.round(size * 2) / 2;

/** The lines of a page, from the text pdf.js gives: runs at the same height are one line. */
export async function linesOfPage(doc: PDFDocumentProxy, n: number): Promise<PageLine[]> {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  const lines: (PageLine & { letters: number; weighted: number })[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const size = Math.hypot(item.transform[0], item.transform[1]);
    const [, top] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const y = top / viewport.height;
    const last = lines.at(-1);
    if (last && Math.abs(last.y - y) < 0.004) {
      last.text += (last.text.endsWith(" ") || item.str.startsWith(" ") ? "" : " ") + item.str;
      last.letters += item.str.length;
      last.weighted += size * item.str.length;
      last.size = last.weighted / last.letters; // the size most of the line has
    } else lines.push({ text: item.str, size, y, letters: item.str.length, weighted: size * item.str.length });
  }
  return lines.map(({ text, size, y }) => ({ text, size, y }));
}

/** Reads a whole book and makes its contents. Null when it was stopped. */
export async function makeOutline(doc: PDFDocumentProxy, stop: { now: boolean } = { now: false }): Promise<OutlineItem[] | null> {
  const pages: { page: number; lines: PageLine[] }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (stop.now) return null;
    pages.push({ page: n, lines: await linesOfPage(doc, n).catch(() => []) });
    if (n % 25 === 0) await new Promise((r) => setTimeout(r, 0)); // let the screen breathe
  }
  return headingsFromPages(pages);
}
