import type { PDFDocumentProxy } from "../reader/pdf";

// Original colors on purpose: covers should look like the real book.
export async function makeCover(doc: PDFDocumentProxy, width = 360): Promise<Blob | null> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}
