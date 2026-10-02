import type { Book, BooksRepo } from "../db/repos";
import { closePdf, openPdf, readBookInfo, type PDFDocumentProxy } from "../reader/pdf";

export class ImportError extends Error {
  constructor(public code: "not-pdf" | "unreadable", message: string) {
    super(message);
    this.name = "ImportError";
  }
}

async function sha256(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function importPdf(
  file: File,
  deps: {
    books: BooksRepo;
    makeCover: (doc: PDFDocumentProxy) => Promise<Blob | null>;
    now?: () => number;
    newId?: () => string;
  },
): Promise<{ book: Book; duplicate: boolean }> {
  const bytes = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength)));
  if (!head.includes("%PDF-")) throw new ImportError("not-pdf", `${file.name} is not a PDF.`);

  const hash = await sha256(bytes);
  const existing = await deps.books.findByHash(hash);
  if (existing) return { book: existing, duplicate: true };

  let doc: PDFDocumentProxy;
  try {
    doc = await openPdf(new Uint8Array(bytes.slice(0)));
  } catch {
    throw new ImportError("unreadable", `${file.name} could not be opened.`);
  }
  try {
    const info = await readBookInfo(doc, file.name);
    const cover = await deps.makeCover(doc).catch(() => null);
    const book: Book = {
      id: deps.newId?.() ?? crypto.randomUUID(),
      hash,
      ...info,
      fileName: file.name,
      fileSize: file.size,
      addedAt: deps.now?.() ?? Date.now(),
      lastOpenedAt: null,
      finishedAt: null,
    };
    await deps.books.add(book, new Blob([bytes], { type: "application/pdf" }), cover);
    return { book, duplicate: false };
  } finally {
    await closePdf(doc);
  }
}
