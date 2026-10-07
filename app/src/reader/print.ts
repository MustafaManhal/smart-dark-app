import type { PDFDocumentProxy } from "./pdf";

// Sharp enough for text on paper. Long books get a little less, so the pictures fit in memory.
const dpiFor = (pages: number) => (pages > 300 ? 110 : 150);

/**
 * Prints the book in its original colors (dark pages would waste ink). Each
 * page is drawn as a picture into a part of the document that only shows when
 * printing, then the system's print dialog opens. `stop.now` cancels the
 * preparation. Resolves to false when it was cancelled.
 */
export async function printBook(
  doc: PDFDocumentProxy, onProgress: (done: number, total: number) => void, stop: { now: boolean },
): Promise<boolean> {
  const root = document.createElement("div");
  root.className = "print-root";
  const urls: string[] = [];
  const cleanup = () => {
    root.remove();
    sheet.remove();
    for (const url of urls) URL.revokeObjectURL(url);
  };
  // The paper takes the size of the first page, without margins.
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  const sheet = document.createElement("style");
  sheet.textContent = `@page { size: ${first.width}pt ${first.height}pt; margin: 0; }`;

  for (let n = 1; n <= doc.numPages; n++) {
    if (stop.now) {
      cleanup();
      return false;
    }
    onProgress(n, doc.numPages);
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: dpiFor(doc.numPages) / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvas, viewport, intent: "print" }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    canvas.width = canvas.height = 0; // give the memory back before the next page
    if (!blob) continue;
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    urls.push(img.src);
    await img.decode().catch(() => {});
    root.append(img);
  }
  if (stop.now) {
    cleanup();
    return false;
  }
  document.head.append(sheet);
  document.body.append(root);
  // Some browsers return from print() at once, others when the dialog closes: clean up on the event, with a late fallback.
  const done = () => {
    removeEventListener("afterprint", done);
    clearTimeout(timer);
    cleanup();
  };
  const timer = setTimeout(done, 10 * 60_000);
  addEventListener("afterprint", done);
  await new Promise((resolve) => setTimeout(resolve, 50));
  window.print();
  return true;
}
