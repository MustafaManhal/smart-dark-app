import { request, transaction } from "./idb";

export const DRAW_TOOLS = ["pen", "line", "arrow", "rect", "ellipse", "text", "sign"] as const;
export type DrawTool = (typeof DRAW_TOOLS)[number];
/** "ink" is the color of the page's own text: dark on paper, light on a dark page. */
export const DRAW_COLORS = ["ink", "red", "blue", "green", "orange"] as const;
export type DrawColor = (typeof DRAW_COLORS)[number];

/**
 * Something drawn on a page with the pen or a shape tool. Everything is in
 * fractions of the page as the PDF has it, like the other marks.
 */
export type Drawing = {
  id: string; bookId: string; page: number; tool: DrawTool; color: DrawColor;
  /** Thickness of the line (for text: height of the letters) as a share of the page's width. */
  size: number;
  /**
   * pen: x, y, pressure for each point. line, arrow, rect, ellipse: x1, y1, x2, y2. text: x, y of its top left corner.
   * sign (a signature): as pen, with -1, -1, -1 between its strokes.
   */
  points: number[];
  text?: string;
  createdAt: number; updatedAt: number;
};

export class DrawingsRepo {
  constructor(private db: IDBDatabase) {}

  forBook(bookId: string): Promise<Drawing[]> {
    return transaction(this.db, ["drawings"], "readonly", (tx) => request<Drawing[]>(tx.objectStore("drawings").index("bookId").getAll(bookId)));
  }

  all(): Promise<Drawing[]> {
    return transaction(this.db, ["drawings"], "readonly", (tx) => request<Drawing[]>(tx.objectStore("drawings").getAll()));
  }

  put(drawing: Omit<Drawing, "id" | "createdAt" | "updatedAt"> & Partial<Pick<Drawing, "id" | "createdAt">>): Promise<Drawing> {
    const now = Date.now();
    const saved: Drawing = { ...drawing, id: drawing.id ?? crypto.randomUUID(), createdAt: drawing.createdAt ?? now, updatedAt: now };
    return transaction(this.db, ["drawings"], "readwrite", async (tx) => {
      await request(tx.objectStore("drawings").put(saved));
      return saved;
    });
  }

  remove(id: string) {
    return transaction(this.db, ["drawings"], "readwrite", async (tx) => {
      await request(tx.objectStore("drawings").delete(id));
    });
  }

  restore(values: Drawing[]) {
    return transaction(this.db, ["drawings"], "readwrite", async (tx) => {
      for (const v of values) await request(tx.objectStore("drawings").put(v));
    });
  }
}
