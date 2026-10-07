import { THEMES, TINTS } from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, PageStyle } from "../settings";

export type TocEntry = { label: string; href: string; depth: number };

/** The book's table of contents as one flat list, each entry with how deep it sits. */
export function tocList(toc: unknown, depth = 0): TocEntry[] {
  if (!Array.isArray(toc)) return [];
  return toc.flatMap((item: { label?: string; href?: string; subitems?: unknown }) => [
    ...(item?.label && item.href ? [{ label: item.label.trim(), href: item.href, depth }] : []),
    ...tocList(item?.subitems, depth + 1),
  ]);
}

const rgb = (c: number[]) => `rgb(${c.map(Math.round).join(" ")})`;
const flipped = (c: number[]) => c.map((v) => 255 - v);

/**
 * The style sheet put into every section of an e-book.
 *
 * Smart dark for a book that flows uses the same idea as for PDFs, done by the browser: the whole page is
 * inverted and its hues are turned back (a filter on the page, set in ebook.css), so black text becomes
 * light and a red word stays red. Pictures get the same filter a second time, which undoes it exactly:
 * photos keep their real colors. The paper and ink set here are the theme's colors seen through that filter.
 */
export function bookStyles(style: PageStyle, theme: DarkTheme, fontSize: number): string {
  const size = `html { font-size: ${fontSize}% !important; }`;
  const base = `body { background: none !important; } p, li, blockquote, dd { line-height: 1.6; }`;
  if (style === "dark") {
    const { bg, fg } = THEMES[theme];
    return `${size} html { background: ${rgb(flipped(bg))} !important; color: ${rgb(flipped(fg))} !important; } ${base}
      img, svg image, video, canvas { filter: invert(1) hue-rotate(180deg); }`;
  }
  if (style === "sepia") {
    return `${size} html { background: ${rgb(TINTS.sepia.paper)} !important; color: ${rgb(TINTS.sepia.ink)} !important; } ${base}`;
  }
  return `${size} html { background: #ffffff !important; color: #1b1a17; } ${base}`;
}
