import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  THEMES, TINTS, adjustColor, createAdjusters, createColorMapper, createPlainMapper, createTintMapper,
  imageRectsFromCoords, processPage, textRectsFromItems,
} from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, ImageMode, PageStyle, ViewLayout } from "../settings";
import { fromViewPoint, turnCut, type Turn } from "../annotations/geometry";
import { cutFor, NO_CUT, type Crop } from "./crop";
import { resolveDest, type Target } from "./pdf";

export type Adjust = { brightness: number; contrast: number; sepia: number; grayscale: number };
export type RenderOptions = { pageStyle: PageStyle; darkTheme: DarkTheme; imageMode: ImageMode; adjust?: Adjust };
export type ViewOptions = { layout: ViewLayout; cover: boolean; rtl: boolean };
const SPREAD_GAP = 6; // px between the two pages of a spread

const MAX_CANVAS_PIXELS = 16_777_216;
const AHEAD = 1200; // px beyond the viewport to render ahead
const KEEP = 4000; // px beyond which rendered pages are released
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
/** pdf.js scale 1 is 72 dpi; "100%" in PDF apps means 96 dpi. */
export const CSS_UNITS = 96 / 72;
const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

export function pageBackground(o: RenderOptions) {
  const paper = o.pageStyle === "original" ? [255, 255, 255]
    : o.pageStyle === "sepia" ? TINTS.sepia.paper : THEMES[o.darkTheme].bg;
  // Contrast, sepia and grayscale change the paper too; brightness is for text only.
  return `rgb(${adjustColor(paper, createAdjusters(o.adjust).page).join(" ")})`;
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
  searchLayer = document.createElement("div");
  linkLayer = document.createElement("div");
  linksBuilt = false;
  /** The page as the PDF has it: canvas, text, marks and links. Turned as a whole when the reader rotates the book. */
  face = document.createElement("div");
  /** Share of each side that crop margins cuts away (all 0 when it is off), on the page as the PDF has it. */
  cut = NO_CUT;
  turn: Turn = 0;
  textReady: Promise<void>;
  private markTextReady!: () => void;

  constructor(public number: number, public w: number, public h: number) {
    this.div.className = "page";
    this.div.dataset.page = String(number);
    this.highlightLayer.className = "hl-layer";
    this.stickyLayer.className = "sticky-layer";
    this.speechLayer.className = "speech-layer";
    this.searchLayer.className = "search-layer";
    this.linkLayer.className = "link-layer";
    this.face.className = "page-face";
    this.face.append(this.highlightLayer, this.linkLayer);
    // These three are placed from what is on screen, so they stay upright over a turned page.
    this.div.append(this.face, this.searchLayer, this.speechLayer, this.stickyLayer);
    this.textReady = new Promise((resolve) => (this.markTextReady = resolve));
  }

  textIsReady() {
    this.markTextReady();
  }

  /** Width and height of the page as it is shown (a quarter turn swaps them), in PDF units. */
  get vw() {
    return this.turn % 180 ? this.h : this.w;
  }

  get vh() {
    return this.turn % 180 ? this.w : this.h;
  }

  /** The cut margins as they lie on the page as it is shown. */
  get viewCut() {
    return turnCut(this.cut, this.turn);
  }

  size(scale: number) {
    const w = Math.floor(this.w * scale);
    const h = Math.floor(this.h * scale);
    const [vw, vh] = this.turn % 180 ? [h, w] : [w, h];
    this.div.style.width = `${vw}px`;
    this.div.style.height = `${vh}px`;
    this.div.style.setProperty("--scale-factor", String(scale));
    this.face.style.width = `${w}px`;
    this.face.style.height = `${h}px`;
    this.face.style.transform = this.turn === 90 ? `translateX(${h}px) rotate(90deg)`
      : this.turn === 180 ? `translate(${w}px, ${h}px) rotate(180deg)`
      : this.turn === 270 ? `translateY(${w}px) rotate(270deg)` : "";
    // Cut margins: the page keeps its full size, so everything on it keeps its place. What is cut is clipped
    // away (see .page.is-cropped) and the page is pulled in by the same amount.
    const cropped = this.cut.l + this.cut.r + this.cut.t + this.cut.b > 0;
    const view = this.viewCut;
    this.div.classList.toggle("is-cropped", cropped);
    this.div.style.margin = cropped ? `${-view.t * vh}px ${-view.r * vw}px ${-view.b * vh}px ${-view.l * vw}px` : "";
    const vars: [HTMLElement, string, number][] = [
      [this.div, "--crop-l", view.l * vw], [this.div, "--crop-r", view.r * vw], [this.div, "--crop-t", view.t * vh], [this.div, "--crop-b", view.b * vh],
      [this.face, "--cut-l", this.cut.l * w], [this.face, "--cut-r", this.cut.r * w], [this.face, "--cut-t", this.cut.t * h], [this.face, "--cut-b", this.cut.b * h],
    ];
    for (const [el, name, px] of vars) {
      if (cropped) el.style.setProperty(name, `${px}px`);
      else el.style.removeProperty(name);
    }
  }

  /** Top of what is shown of the page, in the scroller. */
  get top() {
    return this.div.offsetTop + this.viewCut.t * this.div.offsetHeight;
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
  private view: ViewOptions = { layout: "scroll", cover: true, rtl: false };
  private content = document.createElement("div");
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; scale: number; cx: number; cy: number; k: number } | null = null;
  private wheelZoom = { factor: 1, x: 0, y: 0, queued: false };
  onPageChange: (page: number) => void = () => {};
  onScaleChange: (scale: number, mode: "fit" | "page" | "manual") => void = () => {};
  /** Whole-book reading position, 0 at the top of page 1 and 1 at the very end. */
  onProgress: (fraction: number) => void = () => {};
  /** The text of a page has been laid out (again after each zoom). */
  onTextRendered: (page: number) => void = () => {};
  /** The accessible name of a link into the book. */
  linkLabel: (page: number) => string = (page) => `Page ${page}`;
  private linkDests = new WeakMap<Element, unknown>();
  private crop: Crop | null = null;
  private turn: Turn = 0;

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

  get zoomMode() {
    return this.mode;
  }

  get scaleValue() {
    return this.scale;
  }

  get pageCount() {
    return this.slots.length;
  }

  async init(zoom?: { mode: "fit" | "page" | "manual"; scale: number }) {
    const first = await this.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    for (let i = 1; i <= this.doc.numPages; i++) {
      const slot = new PageSlot(i, vp.width, vp.height);
      slot.cut = cutFor(this.crop, i);
      slot.turn = this.turn;
      if (i === 1) slot.page = first;
      this.slots.push(slot);
      this.content.append(slot.div);
    }
    this.mode = zoom?.mode ?? "fit";
    if (zoom?.mode === "manual") this.applyScale(clampScale(zoom.scale));
    else this.fit();
    this.resizeObserver.observe(this.container);
  }

  /** Overlay containers for page `number` (1-based). */
  layers(number: number) {
    const slot = this.slots[number - 1];
    return slot
      ? { page: slot.div, highlights: slot.highlightLayer, stickies: slot.stickyLayer, speech: slot.speechLayer, search: slot.searchLayer }
      : null;
  }

  /** The on-screen elements of a page's text items, in the order pdf.js lists the items; null until laid out. */
  textSpans(number: number): HTMLElement[] | null {
    const slot = this.slots[number - 1];
    return slot?.textDiv && slot.textLayer ? slot.textLayer.textDivs : null;
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
        const vx = (clientX - r.left) / r.width;
        const vy = (clientY - r.top) / r.height;
        // The cut margins of a page lie under its neighbors; a point there belongs to the neighbor.
        const cut = s.viewCut;
        if (vx < cut.l || vx > 1 - cut.r || vy < cut.t || vy > 1 - cut.b) continue;
        // x and y are on the page as the PDF has it (where marks are kept); vx and vy on the page as shown.
        const [x, y] = fromViewPoint(vx, vy, s.turn);
        return { page: s.number, x, y, vx, vy, box: r };
      }
    }
    return null;
  }

  setOptions(opts: RenderOptions) {
    this.opts = opts;
    // Contrast, sepia and grayscale are for the whole page; brightness is for text only.
    const { page, text } = createAdjusters(opts.adjust);
    if (opts.pageStyle === "dark") {
      this.mapper = createColorMapper(THEMES[opts.darkTheme], { adjust: page });
      this.textMapper = text && createColorMapper(THEMES[opts.darkTheme], { adjust: text });
    } else if (opts.pageStyle === "sepia") {
      this.mapper = createTintMapper(TINTS.sepia, { adjust: page });
      this.textMapper = text && createTintMapper(TINTS.sepia, { adjust: text });
    } else {
      this.mapper = page || text ? createPlainMapper(page) : null; // untouched original needs no pass
      this.textMapper = text && createPlainMapper(text);
    }
    const a = opts.adjust;
    this.styleKey = `${opts.pageStyle}|${opts.darkTheme}|${opts.imageMode}|${a ? [a.brightness, a.contrast, a.sepia, a.grayscale] : ""}`;
    this.container.style.setProperty("--page-bg", pageBackground(opts));
    this.schedule();
  }

  /** Width divided by height of a page (pages are laid out with the size of the first until they load). */
  aspect(number: number) {
    const slot = this.slots[number - 1];
    return slot ? slot.vw / slot.vh : 0.7;
  }

  /** A small picture of a page, `width` CSS pixels wide, in the page style being read. */
  async thumbnail(number: number, width: number): Promise<HTMLCanvasElement> {
    const page = await this.doc.getPage(number);
    const rotation = (page.rotate + this.turn) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const viewport = page.getViewport({ scale: (width * Math.min(2, devicePixelRatio || 1)) / base.width, rotation });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const mapper = this.mapper;
    await page.render({ canvas, viewport, recordImages: mapper !== null }).promise;
    if (mapper) {
      const ctx = canvas.getContext("2d")!;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rects = imageRectsFromCoords(page.imageCoordinates, canvas.width, canvas.height);
      const imageDim = this.opts.pageStyle === "original" ? 1 : undefined;
      processPage(image, { mapColor: mapper, rects, imageMode: this.opts.imageMode, imageDim });
      ctx.putImageData(image, 0, 0);
    }
    return canvas;
  }

  /** The page shown when the book is scrolled to `fraction` of its length (0 start, 1 end). */
  pageAt(fraction: number) {
    const top = fraction * Math.max(0, this.container.scrollHeight - this.container.clientHeight) + this.inset();
    return this.slotAt(top + this.gap())?.number ?? 1;
  }

  /** The last page that starts at or above `y`; of two pages side by side, the first. */
  private slotAt(y: number) {
    let found: PageSlot | undefined = this.slots[0];
    for (const s of this.slots) {
      if (s.top > y) break;
      if (s.top > found!.top) found = s;
    }
    return found;
  }

  scrollToFraction(fraction: number) {
    this.container.scrollTop = Math.min(1, Math.max(0, fraction)) * Math.max(0, this.container.scrollHeight - this.container.clientHeight);
    this.onScroll();
  }

  /** How the pages are laid out. Keeps the reading position and refits the zoom. */
  setView(view: ViewOptions) {
    const at = this.slots.length ? this.position() : null;
    this.view = view;
    this.content.classList.toggle("is-spread", view.layout === "spread");
    this.content.classList.toggle("has-cover", view.layout === "spread" && view.cover);
    this.content.classList.toggle("is-rtl", view.layout === "spread" && view.rtl);
    this.container.classList.toggle("is-paged", view.layout === "paged");
    if (!at) return;
    if (this.mode === "manual") this.applyScale(this.scale);
    else this.applyScale(this.mode === "page" ? this.pageScale() : this.fitScale());
    this.scrollToPage(at.page, at.offset);
  }

  /**
   * Cuts the margins of every page away (null puts them back). Keeps the
   * reading position, and a zoom that follows the screen fits the text again.
   */
  setCrop(crop: Crop | null) {
    const at = this.slots.length ? this.position() : null;
    this.crop = crop;
    this.content.classList.toggle("is-cropped", !!crop);
    for (const s of this.slots) s.cut = cutFor(crop, s.number);
    if (!at) return;
    this.applyScale(this.mode === "manual" ? this.scale : this.mode === "page" ? this.pageScale() : this.fitScale());
    this.scrollToPage(at.page, at.offset);
  }

  /** Width and height of what is shown of a page, in PDF units. */
  private shown(slot: PageSlot) {
    const cut = slot.viewCut;
    return { w: slot.vw * (1 - cut.l - cut.r), h: slot.vh * (1 - cut.t - cut.b) };
  }

  get turnValue() {
    return this.turn;
  }

  /** Turns every page by quarter turns, clockwise. Marks, notes and links turn with their page. */
  setTurn(turn: Turn) {
    const at = this.slots.length ? this.position() : null;
    this.turn = turn;
    for (const s of this.slots) s.turn = turn;
    if (!at) return;
    this.applyScale(this.mode === "manual" ? this.scale : this.mode === "page" ? this.pageScale() : this.fitScale());
    this.scrollToPage(at.page);
    // Search marks and the read-aloud mark are placed from the text on screen: they are drawn again.
    for (const s of this.slots) if (s.textDiv) this.onTextRendered(s.number);
  }

  /**
   * How far down the shown page a height on the page as the PDF has it lies,
   * for jumps to a link target, a note or a search match. After a quarter turn
   * that height runs across the screen, so the jump goes to the top of the page.
   */
  offsetFor(y: number) {
    return this.turn === 0 ? y : this.turn === 180 ? 1 - y : 0;
  }

  /** Width of one row of pages (one page, or the two of a spread), in PDF units. */
  private rowWidth() {
    const first = this.shown(this.slots[0]).w;
    return this.across() === 2 ? first + this.shown(this.slots[1]).w : first;
  }

  /** Pages side by side: 2 in two-page view. */
  private across() {
    return this.view.layout === "spread" && this.slots.length > 1 ? 2 : 1;
  }

  /** Scale at which the page (or the two pages of a spread) is as wide as the screen. */
  fitScale() {
    const n = this.across();
    const width = this.container.clientWidth - 24 - (n - 1) * SPREAD_GAP;
    return this.slots.length && width > 0 ? clampScale(width / this.rowWidth()) : 1;
  }

  private pageScale() {
    const s = this.slots[0];
    const n = this.across();
    const width = this.container.clientWidth - 24 - (n - 1) * SPREAD_GAP;
    const height = this.container.clientHeight - this.inset() - this.gap() - 12;
    return s ? clampScale(Math.min(width / this.rowWidth(), height / this.shown(s).h)) : 1;
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
    this.container.scrollTop = slot.offsetTop + hit.vy * slot.offsetHeight - fy;
    this.container.scrollLeft = slot.offsetLeft + hit.vx * slot.offsetWidth - fx;
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
    const slot = this.slotAt(top + this.gap());
    if (!slot) return { page: 1, offset: 0 };
    const offset = (top - slot.div.offsetTop) / Math.max(1, slot.div.offsetHeight);
    return { page: slot.number, offset: Math.min(1, Math.max(0, offset)) };
  }

  scrollToPage(page: number, offset = 0) {
    const slot = this.slots[Math.min(this.slots.length, Math.max(1, page)) - 1];
    if (!slot) return;
    // The top of a page is where what is shown of it starts.
    const cut = slot.viewCut.t;
    const at = Math.max(offset, cut);
    this.container.scrollTop = slot.div.offsetTop + at * slot.div.offsetHeight - (offset > cut ? 0 : this.gap()) - this.inset();
    this.onScroll();
  }

  private onScroll = () => {
    const mid = this.container.scrollTop + this.inset() + (this.container.clientHeight - this.inset()) / 3;
    const page = this.slotAt(mid)?.number ?? 1;
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
      // Brightness is for text only, so the page tells us where its text is.
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
    else slot.face.prepend(canvas);
    slot.canvas = canvas;
    slot.key = key;
    if (!slot.linksBuilt) this.buildLinks(slot).catch(() => {});
    if (slot.layerScale !== this.scale) await this.renderText(slot, viewport);
  }

  /**
   * The links of a page, as elements placed over their words (in page
   * fractions, so they follow every zoom). A web address opens in the browser;
   * a link into the book is followed by the reader (see `linkTarget`).
   */
  private async buildLinks(slot: PageSlot) {
    slot.linksBuilt = true;
    const page = slot.page!;
    const viewport = page.getViewport({ scale: 1 });
    for (const a of await page.getAnnotations({ intent: "display" })) {
      const inside: unknown = a.dest;
      const web = typeof a.url === "string" && /^(https?:|mailto:)/i.test(a.url) ? a.url : null;
      if (a.subtype !== "Link" || !Array.isArray(a.rect) || (!inside && !web)) continue;
      const [x1, y1] = viewport.convertToViewportPoint(a.rect[0], a.rect[1]);
      const [x2, y2] = viewport.convertToViewportPoint(a.rect[2], a.rect[3]);
      const link = document.createElement(web ? "a" : "button");
      link.className = web ? "pdf-link" : "pdf-link is-inside";
      link.style.left = `${(Math.min(x1, x2) / viewport.width) * 100}%`;
      link.style.top = `${(Math.min(y1, y2) / viewport.height) * 100}%`;
      link.style.width = `${(Math.abs(x2 - x1) / viewport.width) * 100}%`;
      link.style.height = `${(Math.abs(y2 - y1) / viewport.height) * 100}%`;
      if (link instanceof HTMLAnchorElement) {
        link.href = web!;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = web!;
        link.setAttribute("aria-label", web!);
      } else {
        // A button, so a tap never touches the address bar (the app's screens live in the address).
        link.type = "button";
        this.linkDests.set(link, inside);
        resolveDest(this.doc, inside).then((target) => {
          if (target) link.setAttribute("aria-label", this.linkLabel(target.page));
          else link.remove();
        });
      }
      slot.linkLayer.append(link);
    }
  }

  /** Where a link into the book leads; null for anything else. */
  async linkTarget(link: Element): Promise<Target | null> {
    return this.linkDests.has(link) ? resolveDest(this.doc, this.linkDests.get(link)) : null;
  }

  private async renderText(slot: PageSlot, viewport: ReturnType<PDFPageProxy["getViewport"]>) {
    slot.layerScale = this.scale;
    slot.textLayer?.cancel();
    slot.textDiv?.remove();
    slot.textDiv = document.createElement("div");
    slot.textDiv.className = "textLayer";
    slot.face.append(slot.textDiv);
    slot.textLayer = new pdfjs.TextLayer({
      textContentSource: slot.page!.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: slot.textDiv,
      viewport,
    });
    await slot.textLayer.render().catch(() => {});
    slot.textIsReady();
    this.onTextRendered(slot.number);
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
