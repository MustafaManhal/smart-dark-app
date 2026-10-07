import { request, transaction } from "./idb";

/**
 * Where a mark stands in its review schedule. `id` is the id of the highlight,
 * note or sticky note. The card fields are those of the FSRS scheduler, with
 * dates as numbers so they survive a backup.
 */
export type ReviewState = {
  id: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number;
  last_review: number | null;
  /** When the mark was first reviewed: new cards are counted by day. */
  firstAt: number;
};

export class ReviewsRepo {
  constructor(private db: IDBDatabase) {}

  all(): Promise<ReviewState[]> {
    return transaction(this.db, ["reviews"], "readonly", (tx) => request<ReviewState[]>(tx.objectStore("reviews").getAll()));
  }

  put(state: ReviewState) {
    return transaction(this.db, ["reviews"], "readwrite", async (tx) => {
      await request(tx.objectStore("reviews").put(state));
    });
  }

  restore(values: ReviewState[]) {
    return transaction(this.db, ["reviews"], "readwrite", async (tx) => {
      for (const v of values) await request(tx.objectStore("reviews").put(v));
    });
  }
}
