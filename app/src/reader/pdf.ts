import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type { PDFDocumentProxy };
export type OutlineItem = { title: string; page: number; depth: number };

let assetBase: string | null = null;

export function configurePdfjs(base: string) {
  assetBase = base;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`;
}

export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const assets = assetBase
    ? {
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
        iccUrl: `${assetBase}iccs/`,
      }
    : {};
  return pdfjs.getDocument({ data, enableXfa: false, ...assets }).promise;
}

export async function readBookInfo(doc: PDFDocumentProxy, fileName: string) {
  const { info } = (await doc.getMetadata().catch(() => ({ info: {} }))) as { info: Record<string, unknown> };
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const title = clean(info.Title) || fileName.replace(/\.pdf$/i, "");
  return { title, author: clean(info.Author), pageCount: doc.numPages };
}

export async function flattenOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await doc.getOutline();
  const result: OutlineItem[] = [];
  async function walk(items: typeof outline, depth: number) {
    for (const item of items ?? []) {
      const page = await resolvePage(doc, item.dest);
      if (page) result.push({ title: item.title.trim(), page, depth });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  }
  await walk(outline, 0);
  return result;
}

async function resolvePage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref] = explicit;
    if (typeof ref === "number") return ref + 1;
    if (ref && typeof ref === "object") return (await doc.getPageIndex(ref)) + 1;
  } catch {}
  return null;
}

// pdf.js 6 dropped PDFDocumentProxy.destroy(); closing goes through the loading task.
export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  return doc?.loadingTask.destroy().catch(() => {});
}
