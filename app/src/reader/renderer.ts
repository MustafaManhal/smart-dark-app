import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  THEMES, TINTS, createColorMapper, createTintMapper, imageRectsFromCoords, processPage,
} from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, ImageMode, PageStyle } from "../settings";

export type RenderOptions = { pageStyle: PageStyle; darkTheme: DarkTheme; imageMode: ImageMode };

const MAX_CANVAS_PIXELS = 16_777_216;
const AHEAD = 1200; // px beyond the viewport to render ahead
const KEEP = 4000; // px beyond which rendered pages are released
const GAP = 12;
const MAX_FIT_WIDTH = 900;

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

  constructor(public number: number, public w: number, public h: number) {
    this.div.className = "page";
    this.div.dataset.page = String(number);
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
  private styleKey = "";
  private current = 1;
  private resizeObserver: ResizeObserver;
  onPageChange: (page: number) => void = () => {};

  constructor(private container: HTMLElement, private doc: PDFDocumentProxy, private opts: RenderOptions) {
    this.container.addEventListener("scroll", this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.setOptions(opts);
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
      this.container.append(slot.div);
    }
    this.fit();
    this.resizeObserver.observe(this.container);
  }

  setOptions(opts: RenderOptions) {
    this.opts = opts;
    if (opts.pageStyle === "dark") this.mapper = createColorMapper(THEMES[opts.darkTheme]);
    else if (opts.pageStyle === "sepia") this.mapper = createTintMapper(TINTS.sepia);
    else this.mapper = null;
    this.styleKey = `${opts.pageStyle}|${opts.darkTheme}|${opts.imageMode}`;
    this.container.style.setProperty("--page-bg", pageBackground(opts));
    this.schedule();
  }

  private fit() {
    // Comfortable reading width on big screens; full width on phones.
    const width = Math.min(this.container.clientWidth - 24, MAX_FIT_WIDTH);
    if (width <= 0 || !this.slots.length) return;
    const next = Math.max(0.5, Math.min(2.5, width / this.slots[0].w));
    if (Math.abs(next - this.scale) < 0.001 && this.slots[0].div.style.width) return;
    this.applyScale(next);
  }

  setScale(scale: number) {
    this.applyScale(Math.max(0.5, Math.min(4, scale)));
  }

  private applyScale(scale: number) {
    const anchor = this.position();
    this.scale = scale;
    for (const s of this.slots) s.size(this.scale);
    this.scrollToPage(anchor.page, anchor.offset);
    this.schedule();
  }

  // Height hidden under the floating top bar (CSS scroll-padding-top).
  private inset() {
    return parseFloat(getComputedStyle(this.container).scrollPaddingTop) || 0;
  }

  position() {
    const top = this.container.scrollTop + this.inset();
    let slot = this.slots[0];
    for (const s of this.slots) {
      if (s.div.offsetTop - GAP <= top) slot = s;
      else break;
    }
    if (!slot) return { page: 1, offset: 0 };
    const offset = (top - slot.div.offsetTop) / Math.max(1, slot.div.offsetHeight);
    return { page: slot.number, offset: Math.min(1, Math.max(0, offset)) };
  }

  scrollToPage(page: number, offset = 0) {
    const slot = this.slots[Math.min(this.slots.length, Math.max(1, page)) - 1];
    if (!slot) return;
    this.container.scrollTop = slot.div.offsetTop + offset * slot.div.offsetHeight - (offset ? 0 : GAP) - this.inset();
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
      processPage(image, { mapColor: mapper, rects, imageMode: this.opts.imageMode });
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
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.container.removeEventListener("scroll", this.onScroll);
    for (const s of this.slots) {
      s.release();
      s.textLayer?.cancel();
      s.page?.cleanup();
    }
    this.slots = [];
  }
}
