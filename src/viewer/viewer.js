import * as pdfjsLib from "../lib/pdfjs/pdf.mjs";
import {
  THEMES,
  IMAGE_MODES,
  createColorMapper,
  imageRectsFromCoords,
  processPage,
} from "./smart-invert.js";
import {
  getSettings,
  setSettings,
  onSettingsChanged,
  hasSiteAccess,
  requestSiteAccess,
  isExtension,
} from "../shared/settings.js";

const lib = (path) => new URL(`../lib/pdfjs/${path}`, import.meta.url).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = lib("pdf.worker.mjs");

const MAX_CANVAS_PIXELS = 16_777_216;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const PAGE_GAP = 14;
const RENDER_AHEAD_PX = 1200;
const KEEP_RENDERED_PX = 4000;

const $ = (id) => document.getElementById(id);
const els = {
  container: $("viewerContainer"),
  viewer: $("viewer"),
  title: $("docTitle"),
  pageNumber: $("pageNumber"),
  pageCount: $("pageCount"),
  prev: $("prevPage"),
  next: $("nextPage"),
  zoomIn: $("zoomIn"),
  zoomOut: $("zoomOut"),
  zoomSelect: $("zoomSelect"),
  toggleDark: $("toggleDark"),
  settingsBtn: $("settingsBtn"),
  settingsPanel: $("settingsPanel"),
  themeSelect: $("themeSelect"),
  imageModeSelect: $("imageModeSelect"),
  contrastRange: $("contrastRange"),
  openFile: $("openFile"),
  fileInput: $("fileInput"),
  download: $("download"),
  openOriginal: $("openOriginal"),
  empty: $("emptyState"),
  emptyOpen: $("emptyOpen"),
  error: $("errorState"),
  errorTitle: $("errorTitle"),
  errorText: $("errorText"),
  errorAction: $("errorAction"),
  errorSecondary: $("errorSecondary"),
  passwordForm: $("passwordForm"),
  passwordText: $("passwordText"),
  passwordInput: $("passwordInput"),
  loading: $("loading"),
  dropOverlay: $("dropOverlay"),
};

const state = {
  settings: null,
  mapper: null,
  styleKey: "",
  pdf: null,
  loadingTask: null,
  source: null, // { url } or { data, name }
  fileName: "",
  pages: [],
  scale: 1,
  zoomMode: "page-width",
  currentPage: 1,
  renderLoopScheduled: false,
  rendering: false,
};

// Expose state for debugging when the viewer runs outside the extension.
if (!isExtension) globalThis.__smartDarkState = state;

// ---------------------------------------------------------------- settings

function applySettings(settings) {
  state.settings = settings;
  const theme = THEMES[settings.theme] || THEMES.dark;
  state.mapper = createColorMapper(theme, { contrast: settings.contrast });
  state.styleKey = settings.enabled
    ? `${settings.theme}|${settings.imageMode}|${settings.contrast}`
    : "original";

  const root = document.documentElement;
  root.classList.toggle("original", !settings.enabled);
  root.style.setProperty("--page-bg", `rgb(${theme.bg.join(" ")})`);
  root.style.setProperty("--page-fg", `rgb(${theme.fg.join(" ")})`);

  els.toggleDark.setAttribute("aria-pressed", String(settings.enabled));
  els.themeSelect.value = settings.theme;
  els.imageModeSelect.value = settings.imageMode;
  els.contrastRange.value = String(settings.contrast);
  scheduleRender();
}

function fillSelect(select, entries) {
  for (const [value, label] of entries) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
}

// ---------------------------------------------------------------- source

function sourceFromLocation() {
  // Redirected by declarativeNetRequest: the raw URL follows "?DNR:".
  if (location.search.startsWith("?DNR:")) {
    return { url: location.search.slice(5) };
  }
  const file = new URLSearchParams(location.search).get("file");
  return file ? { url: file } : null;
}

function fileNameFromUrl(url) {
  try {
    const { pathname, hostname } = new URL(url, location.href);
    const last = pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : hostname;
  } catch {
    return "document.pdf";
  }
}

async function openSource(source, password) {
  await closeDocument();
  state.source = source;
  state.fileName = source.name || fileNameFromUrl(source.url);
  setTitle(state.fileName);
  showMessage(null);
  els.loading.hidden = false;
  els.openOriginal.hidden = !(isExtension && source.url && /^https?:|^file:/.test(source.url));

  const params = {
    cMapUrl: lib("cmaps/"),
    cMapPacked: true,
    standardFontDataUrl: lib("standard_fonts/"),
    wasmUrl: lib("wasm/"),
    iccUrl: lib("iccs/"),
    enableXfa: false,
    password,
  };
  if (source.data) params.data = source.data.slice(0);
  else {
    params.url = source.url;
    params.withCredentials = true;
  }

  const task = pdfjsLib.getDocument(params);
  state.loadingTask = task;
  try {
    const pdf = await task.promise;
    if (state.loadingTask !== task) return;
    state.pdf = pdf;
    await setupPages(pdf);
    els.download.disabled = false;
    pdf.getMetadata().then(({ info }) => {
      const title = info?.Title?.trim();
      if (title && state.pdf === pdf) setTitle(title, state.fileName);
    }).catch(() => {});
  } catch (error) {
    if (state.loadingTask !== task) return;
    await handleLoadError(error, source);
  } finally {
    if (state.loadingTask === task) els.loading.hidden = true;
  }
}

async function closeDocument() {
  for (const page of state.pages) page.destroy();
  state.pages = [];
  els.viewer.textContent = "";
  els.download.disabled = true;
  els.pageCount.textContent = "–";
  const task = state.loadingTask;
  state.loadingTask = null;
  state.pdf = null;
  if (task) await task.destroy().catch(() => {});
}

function setTitle(title, fileName) {
  els.title.textContent = title;
  els.title.title = fileName ? `${title} — ${fileName}` : title;
  document.title = `${title} · Smart Dark PDF`;
}

async function handleLoadError(error, source) {
  if (error?.name === "PasswordException") {
    els.passwordText.textContent =
      error.code === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
        ? "That password did not work. Try again."
        : "This PDF is protected. Enter its password to open it.";
    showMessage(els.passwordForm);
    els.passwordInput.value = "";
    els.passwordInput.focus();
    els.passwordForm.onsubmit = (event) => {
      event.preventDefault();
      openSource(source, els.passwordInput.value);
    };
    return;
  }

  console.error(error);
  const actions = [];
  let text = "The file may be damaged, or it is not a PDF.";

  if (source.url && !source.data) {
    const isFile = source.url.startsWith("file:");
    const granted = await hasSiteAccess();
    if (isFile && isExtension) {
      text = "Chrome blocks extensions from reading local files until you allow it. "
        + "Turn on “Allow access to file URLs” for Smart Dark PDF, or open the file with the button below.";
      actions.push(["Open extension settings", () =>
        chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })]);
      actions.push(["Choose the file", () => els.fileInput.click()]);
    } else if (!granted) {
      text = "Smart Dark PDF needs your permission to read PDFs from websites. "
        + "It only reads the PDF you open, on this device.";
      actions.push(["Allow access", async () => {
        if (await requestSiteAccess()) openSource(source);
      }]);
    } else if (error?.name === "ResponseException" || error?.name === "MissingPDFException") {
      text = "The website did not return the PDF. It may need you to sign in, or the link may have expired.";
      actions.push(["Open in built-in viewer", openInBuiltInViewer]);
    } else {
      actions.push(["Open in built-in viewer", openInBuiltInViewer]);
    }
  }

  els.errorTitle.textContent = "Could not open this PDF";
  els.errorText.textContent = text;
  const [primary, secondary] = actions;
  setButton(els.errorAction, primary);
  setButton(els.errorSecondary, secondary);
  showMessage(els.error);
}

function setButton(button, action) {
  button.hidden = !action;
  if (action) {
    button.textContent = action[0];
    button.onclick = action[1];
  }
}

function showMessage(element) {
  for (const el of [els.empty, els.error, els.passwordForm]) el.hidden = el !== element;
}

// Let the browser's own viewer handle this URL once (see background.js).
async function openInBuiltInViewer() {
  const url = state.source?.url;
  if (!url) return;
  if (isExtension) await chrome.runtime.sendMessage({ type: "bypassOnce", url }).catch(() => {});
  location.href = url;
}

// ---------------------------------------------------------------- pages

class PageView {
  constructor(index, width, height) {
    this.index = index;
    this.number = index + 1;
    this.pdfPage = null;
    this.baseWidth = width; // CSS px at scale 1
    this.baseHeight = height;
    this.renderedKey = "";
    this.layersScale = 0;
    this.renderTask = null;
    this.textLayer = null;

    this.div = document.createElement("div");
    this.div.className = "page";
    this.div.dataset.page = String(this.number);
    this.div.setAttribute("role", "region");
    this.div.setAttribute("aria-label", `Page ${this.number}`);
    this.canvas = null;
    this.textDiv = null;
    this.linkDiv = null;
  }

  setPdfPage(pdfPage) {
    this.pdfPage = pdfPage;
    const vp = pdfPage.getViewport({ scale: 1 });
    this.baseWidth = vp.width;
    this.baseHeight = vp.height;
  }

  updateSize(scale) {
    this.div.style.width = `${Math.floor(this.baseWidth * scale)}px`;
    this.div.style.height = `${Math.floor(this.baseHeight * scale)}px`;
    this.div.style.setProperty("--scale-factor", String(scale));
  }

  key(scale) {
    return `${scale}|${devicePixelRatio}|${state.styleKey}`;
  }

  async render(scale) {
    if (!this.pdfPage) this.setPdfPage(await state.pdf.getPage(this.number));
    const key = this.key(scale);
    const viewport = this.pdfPage.getViewport({ scale });

    let outputScale = devicePixelRatio || 1;
    const pixels = viewport.width * viewport.height * outputScale * outputScale;
    if (pixels > MAX_CANVAS_PIXELS) outputScale = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.setAttribute("aria-hidden", "true");

    const settings = state.settings;
    this.renderTask = this.pdfPage.render({
      canvas,
      viewport,
      transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      recordImages: settings.enabled,
    });
    try {
      await this.renderTask.promise;
    } finally {
      this.renderTask = null;
    }

    if (settings.enabled) {
      const ctx = canvas.getContext("2d");
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rects = imageRectsFromCoords(this.pdfPage.imageCoordinates, canvas.width, canvas.height);
      processPage(imageData, { mapColor: state.mapper, rects, imageMode: settings.imageMode });
      ctx.putImageData(imageData, 0, 0);
    }

    // Swap in the new canvas only when it is ready, so theme and zoom
    // changes never flash an empty page.
    if (this.canvas) this.canvas.replaceWith(canvas);
    else this.div.prepend(canvas);
    this.canvas = canvas;
    this.renderedKey = key;

    if (this.layersScale !== scale) await this.renderLayers(viewport, scale);
  }

  async renderLayers(viewport, scale) {
    this.layersScale = scale;
    this.textLayer?.cancel();
    this.textDiv?.remove();
    this.linkDiv?.remove();

    this.textDiv = document.createElement("div");
    this.textDiv.className = "textLayer";
    this.linkDiv = document.createElement("div");
    this.linkDiv.className = "linkLayer";
    this.div.append(this.textDiv, this.linkDiv);

    const textLayer = new pdfjsLib.TextLayer({
      textContentSource: this.pdfPage.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: this.textDiv,
      viewport,
    });
    this.textLayer = textLayer;
    try {
      await textLayer.render();
      const end = document.createElement("div");
      end.className = "endOfContent";
      this.textDiv.append(end);
    } catch (error) {
      if (error?.name !== "AbortException") console.warn("Text layer failed", error);
    }

    try {
      const annotations = await this.pdfPage.getAnnotations({ intent: "display" });
      for (const annotation of annotations) {
        if (annotation.subtype !== "Link") continue;
        const link = createLink(annotation);
        if (!link) continue;
        const [px1, py1, px2, py2] = annotation.rect;
        const [x1, y1] = viewport.convertToViewportPoint(px1, py1);
        const [x2, y2] = viewport.convertToViewportPoint(px2, py2);
        Object.assign(link.style, {
          left: `${Math.min(x1, x2)}px`,
          top: `${Math.min(y1, y2)}px`,
          width: `${Math.abs(x2 - x1)}px`,
          height: `${Math.abs(y2 - y1)}px`,
        });
        this.linkDiv.append(link);
      }
    } catch (error) {
      console.warn("Links failed", error);
    }
  }

  showPlaceholder() {
    if (this.canvas || this.div.querySelector(".spinner")) return;
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    spinner.textContent = `Page ${this.number}`;
    this.div.append(spinner);
  }

  clearPlaceholder() {
    this.div.querySelector(".spinner")?.remove();
  }

  release() {
    this.renderTask?.cancel();
    this.renderTask = null;
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.canvas.remove();
      this.canvas = null;
    }
    this.renderedKey = "";
  }

  destroy() {
    this.release();
    this.textLayer?.cancel();
    this.pdfPage?.cleanup();
  }
}

function createLink(annotation) {
  const a = document.createElement("a");
  if (annotation.url) {
    let url;
    try {
      url = new URL(annotation.url);
    } catch {
      return null;
    }
    if (!/^(https?|mailto):$/.test(url.protocol)) return null;
    a.href = url.href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = url.href;
    return a;
  }
  if (annotation.dest) {
    a.href = "#";
    a.title = "Go to location";
    a.addEventListener("click", (event) => {
      event.preventDefault();
      goToDestination(annotation.dest);
    });
    return a;
  }
  return null;
}

async function goToDestination(dest) {
  const pdf = state.pdf;
  if (!pdf) return;
  try {
    const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return;
    const [ref] = explicit;
    const index = typeof ref === "object" && ref !== null
      ? await pdf.getPageIndex(ref)
      : Number.isInteger(ref) ? ref : -1;
    if (index >= 0) goToPage(index + 1);
  } catch (error) {
    console.warn("Bad destination", error);
  }
}

async function setupPages(pdf) {
  const first = await pdf.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  els.pageCount.textContent = String(pdf.numPages);
  els.pageNumber.value = "1";

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < pdf.numPages; i++) {
    const page = new PageView(i, vp.width, vp.height);
    if (i === 0) page.setPdfPage(first);
    state.pages.push(page);
    fragment.append(page.div);
  }
  els.viewer.append(fragment);
  state.scale = computeScale(state.zoomMode);
  layoutPages();

  const pageFromHash = Number(new URLSearchParams(location.hash.slice(1)).get("page"));
  if (pageFromHash > 1) goToPage(pageFromHash);
  els.container.focus({ preventScroll: true });
  scheduleRender();
}

function layoutPages() {
  for (const page of state.pages) page.updateSize(state.scale);
  syncZoomSelect();
}

// ---------------------------------------------------------------- zoom

function computeScale(mode) {
  if (!state.pages.length) return 1;
  const page = state.pages[state.currentPage - 1] || state.pages[0];
  const availableWidth = els.container.clientWidth - 40;
  const availableHeight = els.container.clientHeight - 32;
  if (mode === "page-width") return clampScale(Math.min(availableWidth / page.baseWidth, 2));
  if (mode === "page-fit") {
    return clampScale(Math.min(availableWidth / page.baseWidth, availableHeight / page.baseHeight));
  }
  return clampScale(Number(mode) || 1);
}

const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 1000) / 1000));

function setZoom(mode) {
  if (!state.pages.length) return;
  const anchor = captureScrollAnchor();
  state.zoomMode = mode;
  state.scale = computeScale(mode);
  layoutPages();
  restoreScrollAnchor(anchor);
  scheduleRender();
}

function zoomBy(factor) {
  const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  const current = state.scale;
  const next = factor > 1
    ? steps.find((s) => s > current + 0.001) ?? MAX_SCALE
    : [...steps].reverse().find((s) => s < current - 0.001) ?? MIN_SCALE;
  setZoom(String(next));
}

function syncZoomSelect() {
  const value = state.zoomMode;
  const match = [...els.zoomSelect.options].find((o) => o.value === value && !o.hidden);
  const custom = els.zoomSelect.querySelector('option[value="custom"]');
  if (match) {
    els.zoomSelect.value = value;
    custom.hidden = true;
  } else {
    custom.textContent = `${Math.round(state.scale * 100)}%`;
    custom.hidden = false;
    els.zoomSelect.value = "custom";
  }
}

function captureScrollAnchor() {
  const page = state.pages[state.currentPage - 1];
  if (!page) return null;
  const top = page.div.offsetTop;
  const height = page.div.offsetHeight || 1;
  return { page, ratio: (els.container.scrollTop - top) / height };
}

function restoreScrollAnchor(anchor) {
  if (!anchor) return;
  els.container.scrollTop = anchor.page.div.offsetTop + anchor.ratio * anchor.page.div.offsetHeight;
}

// ---------------------------------------------------------------- navigation

function goToPage(number) {
  const page = state.pages[number - 1];
  if (!page) return;
  els.container.scrollTop = page.div.offsetTop - PAGE_GAP;
  updateCurrentPage();
}

function updateCurrentPage() {
  if (!state.pages.length) return;
  const viewTop = els.container.scrollTop;
  const viewMiddle = viewTop + els.container.clientHeight / 3;
  let current = 1;
  for (const page of state.pages) {
    if (page.div.offsetTop <= viewMiddle) current = page.number;
    else break;
  }
  if (current !== state.currentPage || els.pageNumber.value !== String(current)) {
    state.currentPage = current;
    if (document.activeElement !== els.pageNumber) els.pageNumber.value = String(current);
  }
  els.prev.disabled = current <= 1;
  els.next.disabled = current >= state.pages.length;
}

// ---------------------------------------------------------------- rendering

function scheduleRender() {
  if (state.renderLoopScheduled) return;
  state.renderLoopScheduled = true;
  requestAnimationFrame(() => {
    state.renderLoopScheduled = false;
    renderNext();
  });
}

function pageDistance(page, top, bottom) {
  const pTop = page.div.offsetTop;
  const pBottom = pTop + page.div.offsetHeight;
  if (pBottom < top) return top - pBottom;
  if (pTop > bottom) return pTop - bottom;
  return 0;
}

async function renderNext() {
  if (state.rendering || !state.pdf) return;
  const top = els.container.scrollTop;
  const bottom = top + els.container.clientHeight;
  const scale = state.scale;

  let best = null;
  let bestDistance = Infinity;
  for (const page of state.pages) {
    const distance = pageDistance(page, top, bottom);
    if (distance > KEEP_RENDERED_PX) {
      if (page.canvas) page.release();
      continue;
    }
    if (distance > RENDER_AHEAD_PX) continue;
    if (page.renderedKey === page.key(scale)) continue;
    page.showPlaceholder();
    if (distance < bestDistance) {
      best = page;
      bestDistance = distance;
    }
  }
  if (!best) return;

  state.rendering = true;
  const pdf = state.pdf;
  try {
    await best.render(scale);
    best.clearPlaceholder();
  } catch (error) {
    if (error?.name !== "RenderingCancelledException") console.error(`Page ${best.number} failed`, error);
    best.renderedKey = best.key(scale); // do not retry forever
  } finally {
    state.rendering = false;
  }
  if (state.pdf === pdf) scheduleRender();
}

// ---------------------------------------------------------------- local files

async function openFile(file) {
  if (!file) return;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    els.errorTitle.textContent = "That is not a PDF";
    els.errorText.textContent = `“${file.name}” is not a PDF file.`;
    setButton(els.errorAction, ["Choose another file", () => els.fileInput.click()]);
    setButton(els.errorSecondary, null);
    showMessage(els.error);
    return;
  }
  const data = new Uint8Array(await file.arrayBuffer());
  history.replaceState(null, "", location.pathname);
  openSource({ data, name: file.name });
}

async function downloadOriginal() {
  if (!state.pdf) return;
  const data = await state.pdf.getData();
  const blob = new Blob([data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = /\.pdf$/i.test(state.fileName) ? state.fileName : `${state.fileName || "document"}.pdf`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ---------------------------------------------------------------- events

function bindEvents() {
  els.container.addEventListener("scroll", () => {
    updateCurrentPage();
    scheduleRender();
  }, { passive: true });

  let resizeTimer;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.zoomMode === "page-width" || state.zoomMode === "page-fit") setZoom(state.zoomMode);
      else scheduleRender();
    }, 120);
  }).observe(els.container);

  // Re-render sharp when the window moves to a screen with another DPR.
  const watchDpr = () => {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => {
      scheduleRender();
      watchDpr();
    }, { once: true });
  };
  watchDpr();

  els.prev.addEventListener("click", () => goToPage(state.currentPage - 1));
  els.next.addEventListener("click", () => goToPage(state.currentPage + 1));
  els.pageNumber.addEventListener("change", () => {
    const n = Math.round(Number(els.pageNumber.value));
    if (n >= 1 && n <= state.pages.length) goToPage(n);
    else els.pageNumber.value = String(state.currentPage);
  });
  els.pageNumber.addEventListener("focus", () => els.pageNumber.select());

  els.zoomIn.addEventListener("click", () => zoomBy(1.1));
  els.zoomOut.addEventListener("click", () => zoomBy(0.9));
  els.zoomSelect.addEventListener("change", () => {
    if (els.zoomSelect.value !== "custom") setZoom(els.zoomSelect.value);
  });

  els.toggleDark.addEventListener("click", () => setSettings({ enabled: !state.settings.enabled }));
  els.themeSelect.addEventListener("change", () => setSettings({ theme: els.themeSelect.value, enabled: true }));
  els.imageModeSelect.addEventListener("change", () => setSettings({ imageMode: els.imageModeSelect.value }));
  els.contrastRange.addEventListener("change", () => setSettings({ contrast: Number(els.contrastRange.value) }));

  els.settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePanel(els.settingsPanel.hidden);
  });
  document.addEventListener("click", (event) => {
    if (!els.settingsPanel.hidden && !els.settingsPanel.contains(event.target)) togglePanel(false);
  });

  els.openFile.addEventListener("click", () => els.fileInput.click());
  els.emptyOpen.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    openFile(els.fileInput.files[0]);
    els.fileInput.value = "";
  });
  els.download.addEventListener("click", downloadOriginal);
  els.openOriginal.addEventListener("click", openInBuiltInViewer);

  let dragDepth = 0;
  window.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    dragDepth++;
    els.dropOverlay.hidden = false;
  });
  window.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropOverlay.hidden = true;
  });
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    openFile(event.dataTransfer?.files[0]);
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", (event) => {
    if (!event.ctrlKey || !state.pages.length) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.1 : 0.9);
  }, { passive: false });
}

function togglePanel(open) {
  els.settingsPanel.hidden = !open;
  els.settingsBtn.setAttribute("aria-expanded", String(open));
}

function onKeyDown(event) {
  const mod = event.ctrlKey || event.metaKey;
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;

  if (mod && (event.key === "=" || event.key === "+")) { event.preventDefault(); zoomBy(1.1); return; }
  if (mod && event.key === "-") { event.preventDefault(); zoomBy(0.9); return; }
  if (mod && event.key === "0") { event.preventDefault(); setZoom("page-width"); return; }
  if (mod && event.key.toLowerCase() === "o") { event.preventDefault(); els.fileInput.click(); return; }
  if (mod && event.key.toLowerCase() === "s") { event.preventDefault(); downloadOriginal(); return; }
  if (event.key === "Escape") { togglePanel(false); return; }
  if (mod || event.altKey || typing) return;

  switch (event.key) {
    case "d":
    case "D":
      setSettings({ enabled: !state.settings.enabled });
      break;
    case "j":
    case "n":
      goToPage(state.currentPage + 1);
      break;
    case "k":
    case "p":
      goToPage(state.currentPage - 1);
      break;
    case "Home":
      goToPage(1);
      break;
    case "End":
      goToPage(state.pages.length);
      break;
    default:
      return;
  }
  event.preventDefault();
}

// ---------------------------------------------------------------- init

async function init() {
  fillSelect(els.themeSelect, Object.entries(THEMES).map(([k, t]) => [k, t.label]));
  fillSelect(els.imageModeSelect, Object.entries(IMAGE_MODES));
  applySettings(await getSettings());
  onSettingsChanged((patch) => applySettings({ ...state.settings, ...patch }));
  bindEvents();

  const source = sourceFromLocation();
  if (source) openSource(source);
  else showMessage(els.empty);
}

init();
