/**
 * Text taken from a PDF page, ready to paste: the page's line breaks become
 * spaces and words that were split at a line end are joined again.
 */
export function tidyCopiedText(text: string) {
  return text
    .replace(/(\p{L})-[ \t]*\n\s*(\p{Ll})/gu, "$1$2") // exam-|ple -> example
    .replace(/-[ \t]*\n\s*/g, "-") // 1990-|1995 and Jean-|Paul keep their hyphen
    .replace(/\s+/g, " ")
    .trim();
}

/** Puts text on the clipboard. Resolves to false when the browser refuses. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard access (older browsers, pages without a secure origin).
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;inset:0 auto auto 0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    area.remove();
    return ok;
  }
}

/** Clipboard text for a Paste button, or null when the browser does not allow reading it. */
export async function readClipboardText() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export const canReadClipboard = () => typeof navigator !== "undefined" && !!navigator.clipboard?.readText;
