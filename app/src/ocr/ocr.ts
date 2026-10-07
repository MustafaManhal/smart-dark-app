import type { PDFDocumentProxy } from "../reader/pdf";
import { FEW_LETTERS, linesFromResult, type OcrPage } from "./text";

export type OcrLang = "eng" | "ara" | "eng+ara";

/** About 200 dots an inch, and never more than 8 million pixels a page. */
const SCALE = 200 / 72;
const MAX_PIXELS = 8_000_000;

/**
 * Recognizes the text of the pages that have none (scans, photographs of
 * pages). It runs in the browser: the pictures of the pages do not leave the
 * device. The engine and the language data come from this app's own files and
 * are loaded when this first runs.
 *
 * `known` are pages done before; `save` is called for each new page.
 */
export async function recognizeBook(
  doc: PDFDocumentProxy, bookId: string, lang: OcrLang, known: Set<number>,
  save: (page: OcrPage) => Promise<void>,
  onProgress: (state: { page: number; total: number; found: number; loading: boolean }) => void,
  stop: { now: boolean },
): Promise<number> {
  const base = new URL("./ocr/", document.baseURI).href;
  onProgress({ page: 0, total: doc.numPages, found: 0, loading: true });
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(lang.split("+"), 1, {
    workerPath: `${base}worker.min.js`, corePath: `${base}core/`, langPath: `${base}lang/`,
    workerBlobURL: false, gzip: true, cacheMethod: "none",
  });
  let found = 0;
  try {
    const canvas = document.createElement("canvas");
    for (let n = 1; n <= doc.numPages && !stop.now; n++) {
      onProgress({ page: n, total: doc.numPages, found, loading: false });
      if (known.has(n)) continue;
      const page = await doc.getPage(n);
      const letters = (await page.getTextContent()).items.reduce((sum, item) => sum + ("str" in item ? item.str.trim().length : 0), 0);
      if (letters >= FEW_LETTERS) continue; // the page has its own text
      const unit = page.getViewport({ scale: 1 });
      const scale = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (unit.width * unit.height)));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, viewport }).promise;
      if (stop.now) break;
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const lines = linesFromResult(data.blocks, canvas.width, canvas.height);
      // A page without words (a photograph, a blank) is remembered too, so it is not tried again.
      await save({ id: `${bookId}:${n}`, bookId, page: n, lang, lines });
      if (lines.length) found++;
    }
    canvas.width = canvas.height = 0;
  } finally {
    await worker.terminate();
  }
  return found;
}
