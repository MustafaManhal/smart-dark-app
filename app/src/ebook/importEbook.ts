import type { Book, BookFormat, BooksRepo } from "../db/repos";
import { ImportError } from "../library/importer";

/** What foliate-js tells about a book it opened. Only the parts used here. */
type OpenedBook = {
  metadata?: { title?: unknown; author?: unknown; language?: unknown };
  sections: unknown[];
  getCover?: () => Promise<Blob | null> | Blob | null;
};

/** A title or a name as the book gives it: plain text, text for each language, or an object with a name. */
export function plainText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("name" in record) return plainText(record.name);
    return plainText(Object.values(record)[0]);
  }
  return String(value);
}

/** The kind of e-book, from how the file starts and what it is called. Null: not a kind the reader knows. */
export function ebookFormat(name: string, head: Uint8Array): BookFormat | null {
  const lower = name.toLowerCase();
  const zip = head[0] === 0x50 && head[1] === 0x4b;
  if (zip) return lower.endsWith(".cbz") ? "cbz" : /\.(fbz|fb2\.zip)$/.test(lower) ? "fb2" : "epub";
  // MOBI and KF8 files carry "BOOKMOBI" at byte 60.
  if (new TextDecoder().decode(head.subarray(60, 68)) === "BOOKMOBI") return "mobi";
  if (lower.endsWith(".fb2")) return "fb2";
  return null;
}

const MIME: Record<BookFormat, string> = {
  pdf: "application/pdf", epub: "application/epub+zip", mobi: "application/x-mobipocket-ebook",
  fb2: "application/x-fictionbook+xml", cbz: "application/vnd.comicbook+zip",
};

/** The cover as a JPEG no wider than the library shows it. */
async function smallCover(cover: Blob, width = 360): Promise<Blob | null> {
  const bitmap = await createImageBitmap(cover);
  const scale = Math.min(1, width / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

/** Adds an e-book (EPUB, MOBI, FB2, CBZ) to the library. The file is opened once, for its title, author and cover. */
export async function importEbook(
  file: File, format: BookFormat, hash: string,
  deps: { books: BooksRepo; now?: () => number; newId?: () => string },
): Promise<Book> {
  let opened: OpenedBook;
  try {
    const { makeBook } = await import("../../../vendor/foliate-js/view.js");
    opened = (await makeBook(file)) as OpenedBook;
  } catch {
    throw new ImportError("unreadable", `${file.name} could not be opened.`);
  }
  const cover = await Promise.resolve(opened.getCover?.()).then((blob) => (blob ? smallCover(blob) : null)).catch(() => null);
  const book: Book = {
    id: deps.newId?.() ?? crypto.randomUUID(),
    hash,
    title: plainText(opened.metadata?.title) || file.name.replace(/\.[^.]+$/, ""),
    author: plainText(opened.metadata?.author),
    // An e-book has no pages. Its sections (chapter files) stand in where a count is needed.
    pageCount: Math.max(1, opened.sections.length),
    fileName: file.name,
    fileSize: file.size,
    addedAt: deps.now?.() ?? Date.now(),
    lastOpenedAt: null,
    finishedAt: null,
    format,
  };
  await deps.books.add(book, new Blob([await file.arrayBuffer()], { type: MIME[format] }), cover);
  return book;
}
