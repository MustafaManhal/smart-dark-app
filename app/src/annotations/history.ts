/** One thing the reader did that can be taken back and done again. */
export type Step = {
  undo: () => unknown;
  redo: () => unknown;
  /** Steps with the same key that follow each other closely count as one (typing in a sticky note). */
  mergeKey?: string;
};

const LIMIT = 100;
const MERGE_MS = 3000;

/** Undo and redo for the edits made in one book: highlights, notes, sticky notes, bookmarks. */
export class History {
  private done: (Step & { at: number })[] = [];
  private undone: Step[] = [];

  constructor(private onChange: () => void = () => {}, private now: () => number = Date.now) {}

  get canUndo() {
    return this.done.length > 0;
  }

  get canRedo() {
    return this.undone.length > 0;
  }

  /** Record a step that has just been done. A new step ends the chance to redo older ones. */
  push(step: Step) {
    const last = this.done.at(-1);
    const at = this.now();
    if (step.mergeKey && last?.mergeKey === step.mergeKey && at - last.at < MERGE_MS) {
      // Same edit still going on: keep where it started, go to where it is now.
      last.redo = step.redo;
      last.at = at;
    } else {
      this.done.push({ ...step, at });
      if (this.done.length > LIMIT) this.done.shift();
    }
    this.undone = [];
    this.onChange();
  }

  async undo() {
    const step = this.done.pop();
    if (!step) return false;
    await step.undo();
    this.undone.push(step);
    this.onChange();
    return true;
  }

  async redo() {
    const step = this.undone.pop();
    if (!step) return false;
    await step.redo();
    this.done.push({ ...step, at: 0 }); // never merged into
    this.onChange();
    return true;
  }
}
