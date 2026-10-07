import type { OcrPage } from "../ocr/text";
import { request, transaction } from "./idb";

/** Text recognized on scanned pages. Key: "<bookId>:<page>". */
export class OcrRepo {
  constructor(private db: IDBDatabase) {}

  forBook(bookId: string): Promise<OcrPage[]> {
    return transaction(this.db, ["ocr"], "readonly", (tx) => request<OcrPage[]>(tx.objectStore("ocr").index("bookId").getAll(bookId)));
  }

  put(page: OcrPage) {
    return transaction(this.db, ["ocr"], "readwrite", async (tx) => {
      await request(tx.objectStore("ocr").put(page));
    });
  }
}
