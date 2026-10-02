export const DB_NAME = "smart-dark-reader";
export const DB_VERSION = 1;

// Each upgrade step runs once, in order, for users coming from older versions.
export function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const books = db.createObjectStore("books", { keyPath: "id" });
    books.createIndex("hash", "hash", { unique: true });
    db.createObjectStore("files"); // key: bookId, value: { type, data: ArrayBuffer }
    db.createObjectStore("covers"); // key: bookId, value: { type, data: ArrayBuffer }
    db.createObjectStore("progress", { keyPath: "bookId" });
    db.createObjectStore("settings"); // key: setting name
  }
}
