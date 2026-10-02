import { request, transaction } from "./idb";

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
};

export type Progress = { bookId: string; page: number; offset: number; updatedAt: number };

export class BooksRepo {
  constructor(private db: IDBDatabase) {}

  add(book: Book, file: Blob, cover: Blob | null) {
    return transaction(this.db, ["books", "files", "covers"], "readwrite", async (tx) => {
      await request(tx.objectStore("books").add(book));
      await request(tx.objectStore("files").put(file, book.id));
      if (cover) await request(tx.objectStore("covers").put(cover, book.id));
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
    return transaction(this.db, ["books", "files", "covers", "progress"], "readwrite", async (tx) => {
      for (const store of ["books", "files", "covers", "progress"]) await request(tx.objectStore(store).delete(id));
    });
  }

  file(id: string) {
    return transaction(this.db, ["files"], "readonly", (tx) => request<Blob | undefined>(tx.objectStore("files").get(id)));
  }

  cover(id: string) {
    return transaction(this.db, ["covers"], "readonly", (tx) => request<Blob | undefined>(tx.objectStore("covers").get(id)));
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
}

export type Repos = { books: BooksRepo; progress: ProgressRepo; settings: SettingsRepo };

export function createRepos(db: IDBDatabase): Repos {
  return { books: new BooksRepo(db), progress: new ProgressRepo(db), settings: new SettingsRepo(db) };
}
