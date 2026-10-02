export const DB_NAME = "smart-dark-reader";
export const DB_VERSION = 3;

// Each upgrade step runs once, in order, for users coming from older versions.
export function upgrade(db: IDBDatabase, oldVersion: number, tx: IDBTransaction) {
  if (oldVersion < 1) {
    const books = db.createObjectStore("books", { keyPath: "id" });
    books.createIndex("hash", "hash", { unique: true });
    db.createObjectStore("files"); // key: bookId, value: { type, data: ArrayBuffer }
    db.createObjectStore("covers"); // key: bookId, value: { type, data: ArrayBuffer }
    db.createObjectStore("progress", { keyPath: "bookId" });
    db.createObjectStore("settings"); // key: setting name
  }
  if (oldVersion < 2) {
    for (const name of ["highlights", "stickies", "bookmarks"]) {
      db.createObjectStore(name, { keyPath: "id" }).createIndex("bookId", "bookId");
    }
  }
  if (oldVersion < 3) {
    // Notes become their own annotation instead of a field on highlights.
    db.createObjectStore("notes", { keyPath: "id" }).createIndex("bookId", "bookId");
    const notes = tx.objectStore("notes");
    tx.objectStore("highlights").openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      const { note, ...highlight } = cursor.value;
      if (typeof note === "string" && note.trim()) {
        notes.put({
          id: `${highlight.id}-note`, bookId: highlight.bookId, page: highlight.page, rects: highlight.rects,
          text: highlight.text, body: note, createdAt: highlight.createdAt, updatedAt: highlight.updatedAt,
        });
      }
      cursor.update(highlight);
      cursor.continue();
    };
  }
}
