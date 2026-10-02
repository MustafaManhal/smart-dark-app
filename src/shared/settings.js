// Settings shared by the viewer, popup, welcome page and service worker.
// Outside the extension (plain http, used for local testing) settings fall
// back to localStorage so the viewer still runs.

export const DEFAULTS = {
  enabled: true, // smart dark mode on (false = show original colors)
  theme: "dark",
  imageMode: "smart",
  contrast: 1.5,
  autoOpen: true, // open PDF links in this viewer (needs host permission)
};

export const isExtension = !!globalThis.chrome?.runtime?.id;

const LOCAL_KEY = "smartDarkPdfSettings";
const localListeners = new Set();

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY)) || {};
  } catch {
    return {};
  }
}

export async function getSettings() {
  const stored = isExtension ? await chrome.storage.sync.get(DEFAULTS) : readLocal();
  return { ...DEFAULTS, ...stored };
}

export async function setSettings(patch) {
  if (isExtension) return chrome.storage.sync.set(patch);
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ ...readLocal(), ...patch }));
  } catch {}
  for (const listener of localListeners) listener(patch);
}

export function onSettingsChanged(callback) {
  if (!isExtension) {
    localListeners.add(callback);
    return;
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const patch = {};
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) patch[key] = newValue ?? DEFAULTS[key];
    }
    if (Object.keys(patch).length) callback(patch);
  });
}

export const ALL_URLS = { origins: ["<all_urls>"] };

export function hasSiteAccess() {
  return isExtension ? chrome.permissions.contains(ALL_URLS) : Promise.resolve(true);
}

// Must be called from a user gesture (click handler).
export function requestSiteAccess() {
  return chrome.permissions.request(ALL_URLS);
}

export const VIEWER_PATH = "viewer/viewer.html";

export function viewerUrlFor(fileUrl) {
  const base = chrome.runtime.getURL(VIEWER_PATH);
  return fileUrl ? `${base}?file=${encodeURIComponent(fileUrl)}` : base;
}
