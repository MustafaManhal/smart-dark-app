/**
 * Smart reading: what a person reading a page aloud would leave out or say
 * differently. Whole lines are skipped (page numbers, running headers and
 * footers, bare links, rows of figures) and what is left is tidied for speech
 * (citation marks, footnote numbers, links, common abbreviations).
 */

/** One line of a page: its characters in the page text and where it sits (fractions of the page height). */
export type PageLine = { text: string; start: number; end: number; top: number; bottom: number };

/** Lines seen at the top and bottom of earlier pages, to spot running headers and footers. */
export type EdgeMemory = Map<string, Set<number>>;

const EDGE = 0.08; // top and bottom share of a page where headers and footers live
const letters = (s: string) => s.match(/\p{L}/gu)?.length ?? 0;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'"]/giu;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gu;

/** Header and footer lines differ from page to page only in their numbers. */
const edgeKey = (text: string) => text.toLocaleLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

function looksLikePageNumber(text: string) {
  const s = text.trim();
  return /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/|\|)\s*\d{1,4})?$/iu.test(s) // 12, Page 12, 12 of 80, 12/80
    || /^[ivxlcdm]{1,7}$/iu.test(s) // roman numerals of front matter
    || /^\d{1,4}\s*[|·•–—-]\s*\S/u.test(s) // 12 | Chapter title
    || /\S\s*[|·•–—-]\s*\d{1,4}$/u.test(s); // Chapter title · 12
}

/**
 * For each line, whether read aloud leaves it out. `memory` collects the edge
 * lines of every page it sees, so a header is read on the first page it
 * appears on and skipped from then on.
 */
export function skippedLines(lines: PageLine[], page: number, memory: EdgeMemory): boolean[] {
  return lines.map((line) => {
    const text = line.text.trim();
    if (!text) return true;
    const count = letters(text);
    if (count === 0) return true; // page numbers, axis ticks, rows of figures, rules of symbols

    const atEdge = line.bottom <= EDGE || line.top >= 1 - EDGE;
    if (atEdge && text.length <= 80) {
      if (looksLikePageNumber(text)) return true;
      const key = edgeKey(text);
      const pages = memory.get(key) ?? new Set<number>();
      const seenElsewhere = [...pages].some((p) => p !== page);
      pages.add(page);
      memory.set(key, pages);
      if (seenElsewhere) return true; // running header or footer
    }

    // A line that is only a link or an address.
    if (!text.replace(URL_RE, "").replace(EMAIL_RE, "").match(/\p{L}/u)) return true;

    // Chart and table labels: several one-letter words ("N S E W C").
    const words = text.split(/\s+/);
    if (words.length >= 3 && words.every((w) => w.length === 1)) return true;

    // Mostly figures and symbols: a table row, a formula.
    const solid = text.replace(/\s/g, "").length;
    if (solid >= 6 && count / solid < 0.35) return true;
    return false;
  });
}

const ENGLISH: [RegExp, string][] = [
  [/\be\.g\.,?/giu, "for example,"],
  [/\bi\.e\.,?/giu, "that is,"],
  [/\betc\./giu, "et cetera"],
  [/\bvs\.?(?=\s)/giu, "versus"],
  [/\bet al\./giu, "and others"],
  [/\bFigs?\.(?=\s*\d)/gu, "Figure"],
  [/\bEqs?\.(?=\s*\(?\d)/gu, "Equation"],
  [/\bSec\.(?=\s*\d)/gu, "Section"],
  [/\bCh\.(?=\s*\d)/gu, "Chapter"],
  [/\bNo\.(?=\s*\d)/gu, "Number"],
  [/\bpp\.(?=\s*\d)/gu, "pages"],
  [/\bp\.(?=\s*\d)/gu, "page"],
  [/\bapprox\./giu, "approximately"],
  [/\s&\s/gu, " and "],
];

/**
 * A sentence as it should be spoken. Returns "" when nothing is left to say.
 * The page's own line breaks are still in `text` (as "\n"), so a word split
 * at the end of a line can be told from a real hyphen.
 */
export function speechText(text: string, lang: string): string {
  let s = text
    .replace(/­/g, "") // soft hyphens
    .replace(/(\p{L})-[ \t]*\n\s*(\p{Ll})/gu, "$1$2") // exam-|ple
    .replace(/\s*\n\s*/g, " ")
    .replace(/\[\s*\d+(?:\s*[-–,;]\s*\d+)*\s*\]/g, "") // [12], [3, 4], [5–7]
    .replace(/[¹²³⁰-⁹]+/g, "") // superscript footnote numbers
    .replace(/(\p{L}[.,;:!?”"'’)]?)(?<![A-Z\d])\d{1,3}(?=\s|$)(?<=[.,;:!?”"'’)]\d{1,3})/gu, "$1") // word.12 -> word.
    .replace(/[.·•]{4,}\s*\d*\s*$/u, "") // dot leaders of a table of contents, with the page number
    .replace(EMAIL_RE, " ")
    .replace(URL_RE, lang === "ar" ? " رابط " : " link ")
    .replace(/^\s*[•▪◦●○■□‣➢►*·–—-]\s+/u, ""); // bullet at the start
  if (lang !== "ar") for (const [re, say] of ENGLISH) s = s.replace(re, say);
  s = s.replace(/\s+([,.;:!?])/g, "$1").replace(/\s+/g, " ").trim();
  return /[\p{L}\p{N}]/u.test(s) ? s : "";
}

/** `text` with the characters of skipped lines blanked, so offsets into the page stay the same. */
export function blankSkipped(text: string, lines: PageLine[], skip: boolean[]): string {
  let out = text;
  lines.forEach((line, i) => {
    if (skip[i]) out = out.slice(0, line.start) + " ".repeat(line.end - line.start) + out.slice(line.end);
  });
  return out;
}
