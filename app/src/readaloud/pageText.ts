/** Text of a pdf.js text layer plus a map from character offsets back to DOM text nodes. */
export type PageText = { text: string; pieces: { node: Text; start: number; end: number }[] };

export function readPageText(textLayer: Element): PageText {
  const pieces: PageText["pieces"] = [];
  let text = "";
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      // pdf.js marks line ends with <br>; spans next to each other may lack a space.
      if ((n as Element).tagName === "BR" && text) text = text.replace(/[ \t]*$/, "") + "\n";
      continue;
    }
    const node = n as Text;
    if ((node.parentElement?.className ?? "").includes("endOfContent")) continue;
    const value = node.data;
    if (!value) continue;
    if (text && !/\s$/.test(text) && !/^\s/.test(value) && needsSpace(text, value)) text += " ";
    pieces.push({ node, start: text.length, end: text.length + value.length });
    text += value;
  }
  return { text, pieces };
}

// Two spans join without a space only when the first ends mid-word (hyphenation
// aside, pdf.js splits words when a font or position changes inside them).
function needsSpace(before: string, after: string) {
  const a = before.at(-1)!;
  const b = after[0];
  return !(/[\p{L}\p{N}]/u.test(a) && /[\p{Ll}\p{N}]/u.test(b) && !/[.!?؟]/.test(a));
}

/** A DOM range covering characters [start, end) of a PageText. */
export function rangeFor(page: PageText, start: number, end: number): Range | null {
  const first = page.pieces.find((p) => p.end > start);
  const last = [...page.pieces].reverse().find((p) => p.start < end);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, Math.max(0, start - first.start));
  range.setEnd(last.node, Math.min(last.node.data.length, end - last.start));
  return range;
}
