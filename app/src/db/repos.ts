import { request, transaction } from "./idb";
import { AnnotationsRepo, ANNOTATION_STORES } from "./annotations";
import { SessionsRepo } from "./sessions";
import { ReviewsRepo } from "./reviews";
import { OcrRepo } from "./ocr";
import { DrawingsRepo } from "./drawings";
import type { Crop } from "../reader/crop";

export type Book = {
  id: string;
  hash: string;
  title: string;
  author: string;
  pageCount: number;
  fileName: string;
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number | null;
  finishedAt: number | null;
  /** Marked with a star in the library. */
  favorite?: boolean;
  /** The reader's own labels, as typed. A book can be on several shelves this way. */
  tags?: string[];
  /** Quarter turns the reader gave this book's pages, clockwise, in degrees. */
  rotation?: 0 | 90 | 180 | 270;
  /** Crop margins for this book: whether it is on, and the measured cut (null: nothing to cut). */
  crop?: { on: boolean; box: Crop | null };
  /** For a protected PDF: kept on this device so the book opens without asking again. Never put in backups. */
  password?: string;
};

export type Progress = { bookId: string; page: number; offset: number; updatedAt: number };

// Binary data is stored as { type, data: ArrayBuffer }, not as Blob: WebKit
// cannot store Blobs in IndexedDB in private/ephemeral contexts.
type StoredBinary = { type: string; data: ArrayBuffer };

async function toStored(blob: Blob): Promise<StoredBinary> {
  return { type: blob.type, data: await blob.arrayBuffer() };
}

function fromStored(value: StoredBinary | undefined): Blob | undefined {
  return value ? new Blob([value.data], { type: value.type }) : undefined;
}

export class BooksRepo {
  constructor(private db: IDBDatabase) {}

  async add(book: Book, file: Blob, cover: Blob | null) {
    // Read the bytes before the transaction starts; awaiting inside it would end it.
    const storedFile = await toStored(file);
    const storedCover = cover ? await toStored(cover) : null;
    return transaction(this.db, ["books", "files", "covers"], "readwrite", async (tx) => {
      await request(tx.objectStore("books").add(book));
      await request(tx.objectStore("files").put(storedFile, book.id));
      if (storedCover) await request(tx.objectStore("covers").put(storedCover, book.id));
    });
  }

  get(id: string) {
    return transaction(this.db, ["books"], "readonly", (tx) =>
      request<Book | undefined>(tx.objectStore("books").get(id)));
  }

  all() {
    return transaction(this.db, ["books"], "readonly", (tx) => request<Book[]>(tx.objectStore("books").getAll()));
  }

  findByHash(hash: string) {
    return transaction(this.db, ["books"], "readonly", (tx) =>
      request<Book | undefined>(tx.objectStore("books").index("hash").get(hash)));
  }

  update(id: string, patch: Partial<Book>) {
    return transaction(this.db, ["books"], "readwrite", async (tx) => {
      const store = tx.objectStore("books");
      const current = await request<Book | undefined>(store.get(id));
      if (!current) throw new Error(`No book ${id}`);
      const next = { ...current, ...patch, id };
      await request(store.put(next));
      return next;
    });
  }

  remove(id: string) {
    const stores = ["books", "files", "covers", "progress", "ocr", "drawings", ...ANNOTATION_STORES];
    return transaction(this.db, stores, "readwrite", async (tx) => {
      for (const store of ["books", "files", "covers", "progress"]) await request(tx.objectStore(store).delete(id));
      for (const store of ["ocr", "drawings", ...ANNOTATION_STORES]) {
        const keys = await request(tx.objectStore(store).index("bookId").getAllKeys(id));
        for (const key of keys) await request(tx.objectStore(store).delete(key));
      }
    });
  }

  async file(id: string) {
    return fromStored(await transaction(this.db, ["files"], "readonly", (tx) =>
      request<StoredBinary | undefined>(tx.objectStore("files").get(id))));
  }

  async setCover(id: string, cover: Blob) {
    const stored = await toStored(cover);
    return transaction(this.db, ["covers"], "readwrite", async (tx) => {
      await request(tx.objectStore("covers").put(stored, id));
    });
  }

  async cover(id: string) {
    return fromStored(await transaction(this.db, ["covers"], "readonly", (tx) =>
      request<StoredBinary | undefined>(tx.objectStore("covers").get(id))));
  }
}

export class ProgressRepo {
  constructor(private db: IDBDatabase) {}

  get(bookId: string) {
    return transaction(this.db, ["progress"], "readonly", (tx) =>
      request<Progress | undefined>(tx.objectStore("progress").get(bookId)));
  }

  all() {
    return transaction(this.db, ["progress"], "readonly", (tx) => request<Progress[]>(tx.objectStore("progress").getAll()));
  }

  save(bookId: string, page: number, offset: number) {
    const progress: Progress = {
      bookId,
      page: Math.max(1, Math.round(page)),
      offset: Math.min(1, Math.max(0, offset)),
      updatedAt: Date.now(),
    };
    return transaction(this.db, ["progress"], "readwrite", async (tx) => {
      await request(tx.objectStore("progress").put(progress));
      return progress;
    });
  }
}

export class SettingsRepo {
  constructor(private db: IDBDatabase) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const value = await transaction(this.db, ["settings"], "readonly", (tx) => request(tx.objectStore("settings").get(key)));
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: unknown) {
    return transaction(this.db, ["settings"], "readwrite", async (tx) => {
      await request(tx.objectStore("settings").put(value, key));
    });
  }

  all(): Promise<Record<string, unknown>> {
    return transaction(this.db, ["settings"], "readonly", async (tx) => {
      const store = tx.objectStore("settings");
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      return Object.fromEntries(keys.map((k, i) => [String(k), values[i]]));
    });
  }
}

export type Repos = { books: BooksRepo; progress: ProgressRepo; settings: SettingsRepo; annotations: AnnotationsRepo; sessions: SessionsRepo; reviews: ReviewsRepo; ocr: OcrRepo; drawings: DrawingsRepo };

export function createRepos(db: IDBDatabase): Repos {
  return {
    books: new BooksRepo(db),
    progress: new ProgressRepo(db),
    settings: new SettingsRepo(db),
    annotations: new AnnotationsRepo(db),
    sessions: new SessionsRepo(db),
    reviews: new ReviewsRepo(db),
    ocr: new OcrRepo(db),
    drawings: new DrawingsRepo(db),
  };
}
