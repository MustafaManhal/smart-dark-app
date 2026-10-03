import { request, transaction } from "./idb";

/** A stretch of reading: active time only (idle and hidden time is not counted). */
export type Session = { id: string; bookId: string; start: number; end: number; activeMs: number; pages: number[] };

export class SessionsRepo {
  constructor(private db: IDBDatabase) {}

  save(session: Session) {
    return transaction(this.db, ["sessions"], "readwrite", async (tx) => {
      await request(tx.objectStore("sessions").put(session));
    });
  }

  all(): Promise<Session[]> {
    return transaction(this.db, ["sessions"], "readonly", (tx) => request<Session[]>(tx.objectStore("sessions").getAll()));
  }

  restore(values: Session[]) {
    return transaction(this.db, ["sessions"], "readwrite", async (tx) => {
      for (const v of values) await request(tx.objectStore("sessions").put(v));
    });
  }
}
