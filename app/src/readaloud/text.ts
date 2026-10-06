/** `say` is what is spoken when it differs from the text on the page (see smart.ts). */
export type Sentence = { text: string; start: number; end: number; say?: string };

const MAX_LEN = 220; // short utterances avoid Chrome's ~15 s cut-off

/** Arabic if Arabic letters outnumber Latin ones, Latin if the reverse, else the fallback. */
export function detectLanguage(text: string, fallback: string): string {
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    if (/\p{Script=Arabic}/u.test(ch)) arabic++;
    else if (/\p{Script=Latin}/u.test(ch)) latin++;
  }
  if (arabic > latin) return "ar";
  if (latin > arabic) return "en";
  return fallback;
}

function rawSentences(text: string, lang: string): { start: number; end: number }[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
    return [...segmenter.segment(text)].map((s) => ({ start: s.index, end: s.index + s.segment.length }));
  }
  const out: { start: number; end: number }[] = [];
  const re = /[^.!?؟۔]+[.!?؟۔]*\s*/g;
  for (let m; (m = re.exec(text)); ) out.push({ start: m.index, end: m.index + m[0].length });
  return out;
}

/** Split a long sentence near commas or spaces into pieces of at most MAX_LEN. */
function cut(text: string, start: number, end: number): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = [];
  let from = start;
  while (end - from > MAX_LEN) {
    const window = text.slice(from, from + MAX_LEN);
    let at = Math.max(window.lastIndexOf(", "), window.lastIndexOf("، "), window.lastIndexOf("; "));
    at = at > MAX_LEN * 0.4 ? at + 1 : window.lastIndexOf(" ");
    if (at <= 0) at = MAX_LEN;
    pieces.push({ start: from, end: from + at });
    from += at;
  }
  pieces.push({ start: from, end });
  return pieces;
}

const SHORT_LINE = 45;

/**
 * Paragraph ranges: a line ends its paragraph when it ends with sentence
 * punctuation or is short (headings, captions, chart labels have no period
 * and would otherwise run into the next block).
 */
function paragraphs(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i < text.length && text[i] !== "\n") continue;
    const line = text.slice(lineStart, i).trim();
    if (i === text.length || /[.!?؟۔:]$/.test(line) || line.length < SHORT_LINE) {
      out.push({ start, end: i });
      start = i + 1;
    }
    lineStart = i + 1;
  }
  return out;
}

/** Sentences (trimmed) with their character range in `text`. */
export function splitSentences(text: string, lang: string): Sentence[] {
  const result: Sentence[] = [];
  const raws = paragraphs(text).flatMap((p) =>
    // Line breaks inside a paragraph are wrapping, not sentence ends (same length keeps offsets exact).
    rawSentences(text.slice(p.start, p.end).replace(/\n/g, " "), lang)
      .map((r) => ({ start: r.start + p.start, end: r.end + p.start })));
  for (const raw of raws) {
    for (const piece of cut(text, raw.start, raw.end)) {
      const slice = text.slice(piece.start, piece.end);
      const lead = slice.length - slice.trimStart().length;
      const trimmed = slice.trim();
      if (!/[\p{L}\p{N}]/u.test(trimmed)) continue;
      result.push({ text: trimmed, start: piece.start + lead, end: piece.start + lead + trimmed.length });
    }
  }
  return result;
}
