import type { Book, BooksRepo } from "../db/repos";
import { closePdf, openPdf, PasswordError, readBookInfo, type PDFDocumentProxy } from "../reader/pdf";

export class ImportError extends Error {
  constructor(public code: "not-pdf" | "unreadable" | "password" | "wrong-password", message: string) {
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
  password?: string,
): Promise<{ book: Book; duplicate: boolean }> {
  const bytes = await file.arrayBuffer();
  const start = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
  const isPdf = new TextDecoder().decode(start).includes("%PDF-");
  // An e-book (EPUB, MOBI, FB2, CBZ) goes to the e-book reader's own import. Anything else is refused.
  const { ebookFormat, importEbook } = await import("../ebook/importEbook");
  const format = isPdf ? null : ebookFormat(file.name, start);
  if (!isPdf && !format) throw new ImportError("not-pdf", `${file.name} is not a PDF.`);

  const hash = await sha256(bytes);
  const existing = await deps.books.findByHash(hash);
  if (existing) return { book: existing, duplicate: true };
  if (format) return { book: await importEbook(file, format, hash, deps), duplicate: false };

  let doc: PDFDocumentProxy;
  try {
    doc = await openPdf(new Uint8Array(bytes.slice(0)), password);
  } catch (error) {
    if (error instanceof PasswordError) throw new ImportError(error.wrong ? "wrong-password" : "password", `${file.name} needs its password.`);
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
      ...(password ? { password } : {}),
    };
    await deps.books.add(book, new Blob([bytes], { type: "application/pdf" }), cover);
    return { book, duplicate: false };
  } finally {
    await closePdf(doc);
  }
}
