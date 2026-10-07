import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { ANNOTATION_STORES, type BookAnnotations } from "../db/annotations";
import type { Book, Progress, Repos } from "../db/repos";
import type { Session } from "../db/sessions";
import type { ReviewState } from "../db/reviews";

// The app's first name stays in the format id: backups made before the rename must still restore.
const FORMAT = "smart-dark-reader-backup";
const VERSION = 1;

type BackupManifest = {
  format: typeof FORMAT;
  version: number;
  exportedAt: number;
  books: Book[];
  progress: Progress[];
  annotations: BookAnnotations;
  sessions?: Session[];
  reviews?: ReviewState[];
  settings: Record<string, unknown>;
  covers: Record<string, string>; // bookId -> mime type
};

/**
 * One zip with everything: backup.json plus files/<id>.pdf and covers/<id>.
 * PDFs are already compressed, so the zip only stores them (fast, no CPU spike).
 */
export async function createBackup(repos: Repos, { now = Date.now } = {}): Promise<File> {
  const [books, progress, annotations, settings, sessions, reviews] = await Promise.all([
    repos.books.all(), repos.progress.all(), repos.annotations.all(), repos.settings.all(), repos.sessions.all(), repos.reviews.all(),
  ]);
  const entries: Zippable = {};
  const covers: Record<string, string> = {};
  for (const book of books) {
    const file = await repos.books.file(book.id);
    if (file) entries[`files/${book.id}.pdf`] = [new Uint8Array(await file.arrayBuffer()), { level: 0 }];
    const cover = await repos.books.cover(book.id);
    if (cover) {
      entries[`covers/${book.id}`] = [new Uint8Array(await cover.arrayBuffer()), { level: 0 }];
      covers[book.id] = cover.type || "image/jpeg";
    }
  }
  // A backup can travel; the passwords of protected books stay on the device.
  const bookList = books.map(({ password: _, ...book }) => book);
  const manifest: BackupManifest = { format: FORMAT, version: VERSION, exportedAt: now(), books: bookList, progress, annotations, sessions, reviews, settings, covers };
  entries["backup.json"] = strToU8(JSON.stringify(manifest));
  const date = new Date(now()).toISOString().slice(0, 10);
  return new File([zipSync(entries) as Uint8Array<ArrayBuffer>], `reader343-backup-${date}.zip`, { type: "application/zip" });
}

export type RestoreSummary = { booksAdded: number; booksAlreadyThere: number; annotationsAdded: number };

/**
 * Merges a backup into the library. Books are matched by content hash: a book
 * already in the library is kept as it is, and only annotations it does not
 * have yet are added. Nothing in the library is deleted.
 */
export async function restoreBackup(repos: Repos, zipBytes: Uint8Array): Promise<RestoreSummary> {
  let files: Record<string, Uint8Array>;
  let manifest: BackupManifest;
  try {
    files = unzipSync(zipBytes);
    manifest = JSON.parse(strFromU8(files["backup.json"]));
  } catch {
    throw new Error("This file is not a Reader343 backup.");
  }
  if (manifest?.format !== FORMAT) throw new Error("This file is not a Reader343 backup.");
  if (manifest.version > VERSION) throw new Error("This backup was made by a newer version of the app. Update the app first.");

  const idMap = new Map<string, string>();
  const summary: RestoreSummary = { booksAdded: 0, booksAlreadyThere: 0, annotationsAdded: 0 };

  for (const book of manifest.books) {
    const existing = await repos.books.findByHash(book.hash);
    if (existing) {
      idMap.set(book.id, existing.id);
      summary.booksAlreadyThere++;
      continue;
    }
    const pdf = files[`files/${book.id}.pdf`];
    if (!pdf) continue;
    const id = (await repos.books.get(book.id)) ? crypto.randomUUID() : book.id;
    idMap.set(book.id, id);
    const cover = files[`covers/${book.id}`];
    await repos.books.add(
      { ...book, id },
      new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
      cover ? new Blob([cover as Uint8Array<ArrayBuffer>], { type: manifest.covers[book.id] ?? "image/jpeg" }) : null,
    );
    summary.booksAdded++;
  }

  for (const p of manifest.progress) {
    const id = idMap.get(p.bookId);
    if (id && !(await repos.progress.get(id))) await repos.progress.save(id, p.page, p.offset);
  }

  for (const store of ANNOTATION_STORES) {
    const items = (manifest.annotations[store] ?? []) as { id: string; bookId: string }[];
    const mapped = items.filter((a) => idMap.has(a.bookId)).map((a) => ({ ...a, bookId: idMap.get(a.bookId)! }));
    const already = await repos.annotations.existing(store, mapped.map((a) => a.id));
    let fresh = mapped.filter((a) => !already.has(a.id));
    if (store === "bookmarks") {
      // One bookmark per page: ids differ between devices, pages do not.
      const marked = new Set<string>();
      for (const bookId of new Set(fresh.map((a) => a.bookId))) {
        for (const b of (await repos.annotations.listForBook(bookId)).bookmarks) marked.add(`${b.bookId}:${b.page}`);
      }
      fresh = fresh.filter((a) => {
        const key = `${a.bookId}:${(a as unknown as { page: number }).page}`;
        if (marked.has(key)) return false;
        marked.add(key);
        return true;
      });
    }
    await repos.annotations.restore(store, fresh);
    summary.annotationsAdded += fresh.length;
  }

  // Reading history: sessions of books that are in the library now, skipping ones already there.
  const known = new Set((await repos.sessions.all()).map((x) => x.id));
  await repos.sessions.restore((manifest.sessions ?? [])
    .filter((x) => !known.has(x.id) && idMap.has(x.bookId))
    .map((x) => ({ ...x, bookId: idMap.get(x.bookId)! })));

  // Review schedules, for marks that have none on this device yet.
  const scheduled = new Set((await repos.reviews.all()).map((x) => x.id));
  await repos.reviews.restore((manifest.reviews ?? []).filter((x) => !scheduled.has(x.id)));

  for (const [key, value] of Object.entries(manifest.settings ?? {})) await repos.settings.set(key, value);
  return summary;
}
