import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  THEMES, TINTS, createAdjuster, createColorMapper, createPlainMapper, createTintMapper,
  imageRectsFromCoords, processPage, textRectsFromItems,
} from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, ImageMode, PageStyle } from "../settings";

export type Adjust = { brightness: number; contrast: number; sepia: number; grayscale: number };
export type RenderOptions = { pageStyle: PageStyle; darkTheme: DarkTheme; imageMode: ImageMode; adjust?: Adjust };

const MAX_CANVAS_PIXELS = 16_777_216;
const AHEAD = 1200; // px beyond the viewport to render ahead
const KEEP = 4000; // px beyond which rendered pages are released
const MAX_FIT_WIDTH = 900;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
/** pdf.js scale 1 is 72 dpi; "100%" in PDF apps means 96 dpi. */
export const CSS_UNITS = 96 / 72;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function pageBackground(o: RenderOptions) {
  if (o.pageStyle === "original") return "#ffffff";
  const rgb = o.pageStyle === "sepia" ? TINTS.sepia.paper : THEMES[o.darkTheme].bg;
  return `rgb(${rgb.join(" ")})`;
}

class PageSlot {
  div = document.createElement("div");
  canvas: HTMLCanvasElement | null = null;
  textDiv: HTMLDivElement | null = null;
  page: PDFPageProxy | null = null;
  key = "";
  layerScale = 0;
  task: ReturnType<PDFPageProxy["render"]> | null = null;
  textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null;
  /** Text runs of the page, fetched once when text adjustments are on. */
  textItems: unknown[] | null = null;

  // Overlays live for the whole session; canvas and text layer come and go.
  highlightLayer = document.createElement("div");
  stickyLayer = document.createElement("div");
  speechLayer = document.createElement("div");
  textReady: Promise<void>;
  private markTextReady!: () => void;

  constructor(public number: number, public w: number, public h: number) {
    this.div.className = "page";
    this.div.dataset.page = String(number);
    this.highlightLayer.className = "hl-layer";
    this.stickyLayer.className = "sticky-layer";
    this.speechLayer.className = "speech-layer";
    this.div.append(this.highlightLayer, this.speechLayer, this.stickyLayer);
    this.textReady = new Promise((resolve) => (this.markTextReady = resolve));
  }

  textIsReady() {
    this.markTextReady();
  }

  size(scale: number) {
    this.div.style.width = `${Math.floor(this.w * scale)}px`;
    this.div.style.height = `${Math.floor(this.h * scale)}px`;
    this.div.style.setProperty("--scale-factor", String(scale));
  }

  release() {
    this.task?.cancel();
    this.task = null;
    if (this.canvas) {
      this.canvas.width = this.canvas.height = 0;
      this.canvas.remove();
      this.canvas = null;
    }
    this.key = "";
  }
}

export class Renderer {
  private slots: PageSlot[] = [];
  private scale = 1;
  private busy = false;
  private queued = false;
  private mapper: ((r: number, g: number, b: number) => number) | null = null;
  /** Same mapping plus the adjustments; used for text ink only. */
  private textMapper: ((r: number, g: number, b: number) => number) | null = null;
  private styleKey = "";
  private current = 1;
  private resizeObserver: ResizeObserver;
  private mode: "fit" | "page" | "manual" = "fit";
  private content = document.createElement("div");
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; scale: number; cx: number; cy: number; k: number } | null = null;
  private wheelZoom = { factor: 1, x: 0, y: 0, queued: false };
  onPageChange: (page: number) => void = () => {};
  onScaleChange: (scale: number, mode: "fit" | "page" | "manual") => void = () => {};
  /** Whole-book reading position, 0 at the top of page 1 and 1 at the very end. */
  onProgress: (fraction: number) => void = () => {};

  constructor(private container: HTMLElement, private doc: PDFDocumentProxy, private opts: RenderOptions) {
    this.content.className = "pages";
    this.container.append(this.content);
    this.container.addEventListener("scroll", this.onScroll, { passive: true });
    this.container.addEventListener("wheel", this.onWheel, { passive: false });
    this.container.addEventListener("pointerdown", this.onPointerDown);
    this.container.addEventListener("pointermove", this.onPointerMove);
    for (const t of ["pointerup", "pointercancel", "pointerleave"] as const) this.container.addEventListener(t, this.onPointerUp);
    // iOS Safari: stop its own page zoom; we zoom the pages ourselves.
    this.container.addEventListener("gesturestart", (e) => e.preventDefault());
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.setOptions(opts);
  }

  get scaleValue() {
    return this.scale;
  }

  get pageCount() {
    return this.slots.length;
  }

  async init() {
    const first = await this.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    for (let i = 1; i <= this.doc.numPages; i++) {
      const slot = new PageSlot(i, vp.width, vp.height);
      if (i === 1) slot.page = first;
      this.slots.push(slot);
      this.content.append(slot.div);
    }
    this.fit();
    this.resizeObserver.observe(this.container);
  }

  /** Overlay containers for page `number` (1-based). */
  layers(number: number) {
    const slot = this.slots[number - 1];
    return slot ? { page: slot.div, highlights: slot.highlightLayer, stickies: slot.stickyLayer, speech: slot.speechLayer } : null;
  }

  /**
   * The text layer of a page, once it exists. Scrolls the page into view if it
   * has not been rendered yet (pages are rendered lazily near the viewport).
   */
  async textLayerOf(number: number): Promise<HTMLElement | null> {
    const slot = this.slots[number - 1];
    if (!slot) return null;
    if (!slot.textDiv) this.scrollToPage(number);
    await Promise.race([slot.textReady, new Promise((r) => setTimeout(r, 8000))]);
    return slot.textDiv;
  }

  /** Screen y where the visible reading area starts (below the top bar). */
  visibleTop() {
    return this.container.getBoundingClientRect().top + this.inset();
  }

  /** Scroll just enough to show a viewport rectangle (used to follow read-aloud). */
  reveal(rect: { top: number; bottom: number }) {
    const box = this.container.getBoundingClientRect();
    const top = box.top + this.inset() + 24;
    const bottom = box.bottom - 120;
    if (rect.top < top) this.container.scrollTop -= top - rect.top + 40;
    else if (rect.bottom > bottom) this.container.scrollTop += rect.bottom - bottom + 80;
  }

  /** Which page is under a viewport point, and where on it (page fractions). */
  hitTest(clientX: number, clientY: number) {
    for (const s of this.slots) {
      const r = s.div.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return { page: s.number, x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height, box: r };
      }
    }
    return null;
  }

  setOptions(opts: RenderOptions) {
    this.opts = opts;
    const adjust = createAdjuster(opts.adjust);
    if (opts.pageStyle === "dark") {
      this.mapper = createColorMapper(THEMES[opts.darkTheme]);
      this.textMapper = adjust && createColorMapper(THEMES[opts.darkTheme], { adjust });
    } else if (opts.pageStyle === "sepia") {
      this.mapper = createTintMapper(TINTS.sepia);
      this.textMapper = adjust && createTintMapper(TINTS.sepia, { adjust });
    } else {
      this.mapper = adjust ? createPlainMapper() : null; // untouched original needs no pass
      this.textMapper = adjust && createPlainMapper(adjust);
    }
    const a = opts.adjust;
    this.styleKey = `${opts.pageStyle}|${opts.darkTheme}|${opts.imageMode}|${a ? [a.brightness, a.contrast, a.sepia, a.grayscale] : ""}`;
    this.container.style.setProperty("--page-bg", pageBackground(opts));
    this.schedule();
  }

  /** Scale that fits the page width (capped at a comfortable reading width). */
  fitScale() {
    const width = Math.min(this.container.clientWidth - 24, MAX_FIT_WIDTH);
    return this.slots.length && width > 0 ? clampScale(Math.min(2.5, width / this.slots[0].w)) : 1;
  }

  private pageScale() {
    const s = this.slots[0];
    const width = this.container.clientWidth - 24;
    const height = this.container.clientHeight - this.inset() - this.gap() - 12;
    return s ? clampScale(Math.min(width / s.w, height / s.h)) : 1;
  }

  private fit() {
    if (this.mode === "manual" || !this.slots.length || this.container.clientWidth <= 24) return;
    const next = this.mode === "page" ? this.pageScale() : this.fitScale();
    if (Math.abs(next - this.scale) < 0.001 && this.slots[0].div.style.width) return;
    this.applyScale(next);
  }

  /** Back to fit-width mode (follows window size again). */
  fitWidth() {
    this.mode = "fit";
    this.zoomTo(this.fitScale(), undefined, "fit");
  }

  /** Whole page visible (follows window size until the user zooms). */
  fitPage() {
    if (!this.slots.length) return;
    this.zoomTo(this.pageScale(), undefined, "page");
    this.scrollToPage(this.current);
  }

  /**
   * Zoom so that the point under (clientX, clientY) stays where it is.
   * Without a focal point, the middle of the visible area is kept.
   */
  zoomTo(scale: number, focal?: { clientX: number; clientY: number }, mode: "fit" | "page" | "manual" = "manual") {
    if (!this.slots.length) return;
    this.mode = mode;
    const next = clampScale(scale);
    const box = this.container.getBoundingClientRect();
    const fx = focal ? focal.clientX - box.left : this.container.clientWidth / 2;
    const fy = focal ? focal.clientY - box.top : (this.container.clientHeight + this.inset()) / 2;
    const hit = this.hitTest(box.left + fx, box.top + fy);
    if (!hit) return this.applyScale(next);
    this.scale = next;
    for (const s of this.slots) s.size(next);
    const slot = this.slots[hit.page - 1].div;
    this.container.scrollTop = slot.offsetTop + hit.y * slot.offsetHeight - fy;
    this.container.scrollLeft = slot.offsetLeft + hit.x * slot.offsetWidth - fx;
    this.onScroll();
    this.onScaleChange(next, this.mode);
    this.schedule();
  }

  zoomBy(factor: number, focal?: { clientX: number; clientY: number }) {
    this.zoomTo(this.scale * factor, focal);
  }

  private applyScale(scale: number) {
    const anchor = this.position();
    this.scale = scale;
    for (const s of this.slots) s.size(this.scale);
    this.scrollToPage(anchor.page, anchor.offset);
    this.onScaleChange(scale, this.mode);
    this.schedule();
  }

  // Ctrl/Cmd + wheel, which is also what a trackpad pinch sends on desktop.
  private onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const z = this.wheelZoom;
    z.factor *= Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025));
    z.x = e.clientX;
    z.y = e.clientY;
    if (z.queued) return;
    z.queued = true;
    requestAnimationFrame(() => {
      z.queued = false;
      const factor = z.factor;
      z.factor = 1;
      this.zoomBy(factor, { clientX: z.x, clientY: z.y });
    });
  };

  // Two-finger pinch on touch screens: preview with a CSS transform, re-render at the end.
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const content = this.content.getBoundingClientRect();
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: this.scale, cx, cy, k: 1 };
      this.content.style.transformOrigin = `${cx - content.left}px ${cy - content.top}px`;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.pinch || this.pointers.size < 2) return;
    const [a, b] = [...this.pointers.values()];
    const k = clampScale(this.pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist)) / this.pinch.scale;
    this.pinch.k = k;
    this.content.style.transform = `scale(${k})`;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId) || !this.pinch || this.pointers.size >= 2) return;
    const { scale, k, cx, cy } = this.pinch;
    this.pinch = null;
    this.content.style.transform = "";
    if (Math.abs(k - 1) > 0.01) this.zoomTo(scale * k, { clientX: cx, clientY: cy });
  };

  // Height hidden under the floating top bar (CSS scroll-padding-top).
  private inset() {
    return parseFloat(getComputedStyle(this.container).scrollPaddingTop) || 0;
  }

  // Space kept above a page when jumping to it: the same as above page 1.
  private gap() {
    return Math.max(0, (parseFloat(getComputedStyle(this.container).paddingTop) || 0) - this.inset());
  }

  position() {
    const top = this.container.scrollTop + this.inset();
    let slot = this.slots[0];
    for (const s of this.slots) {
      if (s.div.offsetTop - this.gap() <= top) slot = s;
      else break;
    }
    if (!slot) return { page: 1, offset: 0 };
    const offset = (top - slot.div.offsetTop) / Math.max(1, slot.div.offsetHeight);
    return { page: slot.number, offset: Math.min(1, Math.max(0, offset)) };
  }

  scrollToPage(page: number, offset = 0) {
    const slot = this.slots[Math.min(this.slots.length, Math.max(1, page)) - 1];
    if (!slot) return;
    this.container.scrollTop = slot.div.offsetTop + offset * slot.div.offsetHeight - (offset ? 0 : this.gap()) - this.inset();
    this.onScroll();
  }

  private onScroll = () => {
    const mid = this.container.scrollTop + this.inset() + (this.container.clientHeight - this.inset()) / 3;
    let page = 1;
    for (const s of this.slots) {
      if (s.div.offsetTop <= mid) page = s.number;
      else break;
    }
    if (page !== this.current) {
      this.current = page;
      this.onPageChange(page);
    }
    const max = this.container.scrollHeight - this.container.clientHeight;
    this.onProgress(max > 0 ? Math.min(1, Math.max(0, this.container.scrollTop / max)) : 1);
    this.schedule();
  };

  private schedule() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.renderNext();
    });
  }

  private keyFor() {
    return `${this.scale}|${devicePixelRatio}|${this.styleKey}`;
  }

  private async renderNext() {
    if (this.busy || !this.slots.length) return;
    const top = this.container.scrollTop;
    const bottom = top + this.container.clientHeight;
    let best: PageSlot | null = null;
    let bestDistance = Infinity;
    for (const s of this.slots) {
      const sTop = s.div.offsetTop;
      const sBottom = sTop + s.div.offsetHeight;
      const d = sBottom < top ? top - sBottom : sTop > bottom ? sTop - bottom : 0;
      if (d > KEEP) {
        if (s.canvas) s.release();
        continue;
      }
      if (d > AHEAD || s.key === this.keyFor()) continue;
      if (d < bestDistance) {
        best = s;
        bestDistance = d;
      }
    }
    if (!best) return;
    this.busy = true;
    try {
      await this.renderSlot(best);
    } catch (error) {
      if ((error as Error)?.name !== "RenderingCancelledException") console.error(error);
      best.key = this.keyFor(); // do not retry a broken page forever
    } finally {
      this.busy = false;
    }
    this.schedule();
  }

  private async renderSlot(slot: PageSlot) {
    slot.page ??= await this.doc.getPage(slot.number);
    const key = this.keyFor();
    const viewport = slot.page.getViewport({ scale: this.scale });
    let out = devicePixelRatio || 1;
    if (viewport.width * viewport.height * out * out > MAX_CANVAS_PIXELS) {
      out = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * out);
    canvas.height = Math.floor(viewport.height * out);
    canvas.setAttribute("aria-hidden", "true");
    const mapper = this.mapper;
    const textMapper = this.textMapper;
    slot.task = slot.page.render({
      canvas,
      viewport,
      transform: out !== 1 ? [out, 0, 0, out, 0, 0] : undefined,
      recordImages: mapper !== null,
    });
    await slot.task.promise;
    slot.task = null;
    if (mapper) {
      const ctx = canvas.getContext("2d")!;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rects = imageRectsFromCoords(slot.page.imageCoordinates, canvas.width, canvas.height);
      // The adjustments are for text only, so the page tells us where its text is.
      let textRects: ReturnType<typeof textRectsFromItems> = [];
      if (textMapper) {
        slot.textItems ??= (await slot.page.getTextContent({ disableNormalization: true })).items;
        textRects = textRectsFromItems(slot.textItems, viewport, canvas.width, canvas.height);
      }
      const imageDim = this.opts.pageStyle === "original" ? 1 : undefined; // photos stay as they are
      processPage(image, { mapColor: mapper, mapText: textMapper, textRects, rects, imageMode: this.opts.imageMode, imageDim });
      ctx.putImageData(image, 0, 0);
    }
    // Swap only when ready, so style and zoom changes never flash a blank page.
    if (slot.canvas) slot.canvas.replaceWith(canvas);
    else slot.div.prepend(canvas);
    slot.canvas = canvas;
    slot.key = key;
    if (slot.layerScale !== this.scale) await this.renderText(slot, viewport);
  }

  private async renderText(slot: PageSlot, viewport: ReturnType<PDFPageProxy["getViewport"]>) {
    slot.layerScale = this.scale;
    slot.textLayer?.cancel();
    slot.textDiv?.remove();
    slot.textDiv = document.createElement("div");
    slot.textDiv.className = "textLayer";
    slot.div.append(slot.textDiv);
    slot.textLayer = new pdfjs.TextLayer({
      textContentSource: slot.page!.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: slot.textDiv,
      viewport,
    });
    await slot.textLayer.render().catch(() => {});
    slot.textIsReady();
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.container.removeEventListener("scroll", this.onScroll);
    this.container.removeEventListener("wheel", this.onWheel);
    this.content.remove();
    for (const s of this.slots) {
      s.release();
      s.textLayer?.cancel();
      s.page?.cleanup();
    }
    this.slots = [];
  }
}
