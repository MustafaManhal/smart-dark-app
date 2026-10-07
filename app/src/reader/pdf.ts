import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type { PDFDocumentProxy };
export type OutlineItem = { title: string; page: number; depth: number };

let assetBase: string | null = null;

export function configurePdfjs(base: string) {
  assetBase = base;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`;
}

/** The PDF is protected: it needs a password, or the one given is wrong. */
export class PasswordError extends Error {
  constructor(public wrong: boolean) {
    super(wrong ? "Wrong password" : "Password needed");
    this.name = "PasswordError";
  }
}

export async function openPdf(data: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const assets = assetBase
    ? {
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
        iccUrl: `${assetBase}iccs/`,
      }
    : {};
  try {
    return await pdfjs.getDocument({ data, password, enableXfa: false, ...assets }).promise;
  } catch (error) {
    const e = error as { name?: string; code?: number };
    if (e?.name === "PasswordException") throw new PasswordError(e.code === 2);
    throw error;
  }
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
  return (await resolveDest(doc, dest))?.page ?? null;
}

/** Where a link or a contents entry leads: the page, and how far down it (0 top, 1 bottom) when the PDF says. */
export type Target = { page: number; top: number | null };

export async function resolveDest(doc: PDFDocumentProxy, dest: unknown): Promise<Target | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref, kind, ...args] = explicit as [unknown, { name?: string }?, ...unknown[]];
    const index = typeof ref === "number" ? ref : ref && typeof ref === "object" ? await doc.getPageIndex(ref as never) : null;
    if (index === null || index < 0 || index >= doc.numPages) return null;
    // PDF measures from the bottom of the page; the kind of destination says which number is the top edge.
    const y = kind?.name === "XYZ" ? args[1] : kind?.name === "FitH" || kind?.name === "FitBH" ? args[0] : kind?.name === "FitR" ? args[3] : null;
    let top: number | null = null;
    if (typeof y === "number") {
      const viewport = (await doc.getPage(index + 1)).getViewport({ scale: 1 });
      const [, down] = viewport.convertToViewportPoint(0, y);
      top = Math.min(1, Math.max(0, down / viewport.height));
    }
    return { page: index + 1, top };
  } catch {}
  return null;
}

// pdf.js 6 dropped PDFDocumentProxy.destroy(); closing goes through the loading task.
export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  return doc?.loadingTask.destroy().catch(() => {});
}
