import { t } from "../i18n/i18n";

export type QuoteSource = { title: string; author: string; page: number };

/** A passage as text to paste somewhere else, with the book and the page it comes from. */
export function quoteText(text: string, { title, author, page }: QuoteSource) {
  const from = [title, author, t("page {n}", { n: page })].filter(Boolean).join(", ");
  return `“${text.trim()}”\n${from}`;
}

/** Breaks text into lines no wider than `width`, at spaces; a word longer than a line is cut. */
export function wrapLines(text: string, width: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (measure(word) > width && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure((line ? `${line} ` : "") + word.slice(0, cut)) > width) cut--;
        lines.push((line ? `${line} ` : "") + word.slice(0, cut));
        line = "";
        word = word.slice(cut);
      }
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export const QUOTE_THEMES = ["paper", "night", "ink"] as const;
export type QuoteTheme = (typeof QUOTE_THEMES)[number];
const COLORS: Record<QuoteTheme, { bg: string; text: string; muted: string; accent: string }> = {
  paper: { bg: "#f5f1e8", text: "#1f1d19", muted: "#77716a", accent: "#3550c9" },
  night: { bg: "#14151a", text: "#ececf0", muted: "#9a9ba3", accent: "#91a7ff" },
  ink: { bg: "#2f47b8", text: "#ffffff", muted: "#cfd7ff", accent: "#ffffff" },
};

const WIDTH = 1080;
const PAD = 96;
const MAX_CHARS = 900;
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const FONT = '-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif';

/** The size of the letters for a passage of this length: a short one is large, a long one still fits. */
export const quoteFontSize = (length: number) => (length <= 120 ? 60 : length <= 280 ? 48 : length <= 520 ? 38 : 30);

/** Draws a passage as a picture to share: the words, then the book, the page and the app's name. */
export function drawQuote(text: string, source: QuoteSource, theme: QuoteTheme): HTMLCanvasElement {
  const passage = text.trim().length > MAX_CHARS ? `${text.trim().slice(0, MAX_CHARS).trimEnd()}…` : text.trim();
  const colors = COLORS[theme];
  const rtl = RTL.test(passage);
  const size = quoteFontSize(passage.length);
  const lineHeight = Math.round(size * 1.42);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `500 ${size}px ${FONT}`;
  ctx.font = font;
  const lines = wrapLines(passage, WIDTH - 2 * PAD, (s) => ctx.measureText(s).width);
  const footer = [source.title, source.author].filter(Boolean).join(" · ");
  const height = Math.max(WIDTH, PAD + 110 + lines.length * lineHeight + 190 + PAD);
  canvas.width = WIDTH;
  canvas.height = height;

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
  const start = rtl ? WIDTH - PAD : PAD;

  // The opening mark, then the words, placed in the middle of the room between top and footer.
  const top = Math.max(PAD + 110, (height - 190 - lines.length * lineHeight) / 2 + 40);
  ctx.fillStyle = colors.accent;
  ctx.font = `700 150px Georgia, "Times New Roman", serif`;
  ctx.fillText(rtl ? "”" : "“", start, top - 10);
  ctx.fillStyle = colors.text;
  ctx.font = font;
  lines.forEach((line, i) => ctx.fillText(line, start, top + (i + 1) * lineHeight));

  ctx.fillStyle = colors.accent;
  ctx.fillRect(rtl ? WIDTH - PAD - 64 : PAD, height - PAD - 104, 64, 5);
  ctx.fillStyle = colors.text;
  ctx.font = `600 30px ${FONT}`;
  ctx.direction = RTL.test(footer) ? "rtl" : "ltr";
  const fits = (s: string) => ctx.measureText(s).width <= WIDTH - 2 * PAD;
  let shown = footer;
  while (shown.length > 4 && !fits(shown)) shown = `${shown.slice(0, -2).trimEnd()}…`;
  ctx.fillText(shown, ctx.direction === "rtl" ? WIDTH - PAD : PAD, height - PAD - 48);
  ctx.fillStyle = colors.muted;
  ctx.font = `400 26px ${FONT}`;
  ctx.direction = "ltr";
  ctx.textAlign = rtl ? "right" : "left";
  ctx.fillText(`${t("page {n}", { n: source.page })}  ·  Reader343`, start, height - PAD - 4);
  return canvas;
}
