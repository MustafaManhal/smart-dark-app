import type { Session } from "../db/sessions";

type Options = { now?: () => number; idleMs?: number; gapMs?: number; maxStepMs?: number; saveEveryMs?: number };

/**
 * Measures real reading time for one book. Time counts only while the app is
 * visible and the reader was active in the last two minutes (or read aloud is
 * playing). A break longer than five minutes starts a new session.
 * Call tick() every few seconds.
 */
export class ReadingTracker {
  private session: Session | null = null;
  private page = 1;
  private visible = true;
  private playing = false;
  private dirty = false;
  private lastTick: number;
  private lastActivity: number;
  private lastSave: number;
  private now: () => number;
  private idleMs: number;
  private gapMs: number;
  private maxStepMs: number;
  private saveEveryMs: number;

  constructor(private repo: { save(s: Session): Promise<void> }, private bookId: string, opts: Options = {}) {
    this.now = opts.now ?? Date.now;
    this.idleMs = opts.idleMs ?? 120_000;
    this.gapMs = opts.gapMs ?? 300_000;
    this.maxStepMs = opts.maxStepMs ?? 10_000;
    this.saveEveryMs = opts.saveEveryMs ?? 30_000;
    this.lastTick = this.lastActivity = this.lastSave = this.now();
  }

  private isActive(t: number) {
    return this.visible && (this.playing || t - this.lastActivity <= this.idleMs);
  }

  activity() {
    const t = this.now();
    // Coming back from idle: do not count the idle stretch.
    if (!this.isActive(t)) this.lastTick = t;
    this.lastActivity = t;
  }

  setPage(page: number) {
    this.page = page;
  }

  setPlaying(playing: boolean) {
    if (playing) this.activity();
    this.playing = playing;
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.lastTick = this.now();
    if (!visible) this.flush();
  }

  tick() {
    const t = this.now();
    const step = Math.min(t - this.lastTick, this.maxStepMs);
    this.lastTick = t;
    if (step <= 0 || !this.isActive(t)) return;
    if (!this.session || t - this.session.end > this.gapMs) {
      if (this.session) this.flush();
      this.session = { id: crypto.randomUUID(), bookId: this.bookId, start: t - step, end: t, activeMs: 0, pages: [] };
    }
    this.session.activeMs += step;
    this.session.end = t;
    if (!this.session.pages.includes(this.page)) this.session.pages.push(this.page);
    this.dirty = true;
    if (t - this.lastSave >= this.saveEveryMs) this.flush();
  }

  async flush() {
    if (!this.session || !this.dirty) return;
    this.dirty = false;
    this.lastSave = this.now();
    await this.repo.save({ ...this.session, pages: [...this.session.pages] });
  }
}
