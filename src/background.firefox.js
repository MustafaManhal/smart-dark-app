import { getSettings, onSettingsChanged, VIEWER_PATH } from "./shared/settings.js";

// Firefox build of the background script. Chrome's build (background.js) redirects PDFs with
// declarativeNetRequest rules that look at response headers; Firefox has no such condition
// (MDN: RuleCondition.responseHeaders is not supported), so here the response headers are read
// with webRequest, which Firefox still lets Manifest V3 extensions block on.
//
// The listener only sees sites the user granted access to (optional <all_urls>).

let autoOpen = true;
const ready = getSettings().then((settings) => {
  autoOpen = settings.autoOpen;
});
onSettingsChanged((patch) => {
  if ("autoOpen" in patch) autoOpen = patch.autoOpen;
});

// "Open in built-in viewer": this address is let through once.
const bypass = new Map();

const header = (details, name) => details.responseHeaders?.find((h) => h.name.toLowerCase() === name)?.value?.toLowerCase() ?? "";

/** Whether this response is a PDF the viewer should show. The same cases as the rules of the Chrome build. */
function isPdfToOpen(details) {
  // POST responses cannot be fetched again, so they are left alone.
  if (details.method !== "GET" || details.statusCode < 200 || details.statusCode >= 300) return false;
  const disposition = header(details, "content-disposition");
  // Embedded PDFs that the site wants downloaded, and download links such as "?export=download".
  if (disposition.startsWith("attachment") && (details.type === "sub_frame" || details.url.includes("=download"))) return false;
  const type = header(details, "content-type").split(";")[0].trim();
  if (type === "application/pdf") return true;
  // Wrong MIME type, but the address names a .pdf file.
  return type === "application/octet-stream" && /^https?:\/\/.*\.pdf\b/i.test(details.url);
}

async function onHeaders(details) {
  await ready;
  if (!autoOpen || bypass.has(details.url) || !isPdfToOpen(details)) return {};
  // The same address shape as the Chrome build: the raw address follows "?DNR:".
  return { redirectUrl: chrome.runtime.getURL(VIEWER_PATH) + "?DNR:" + details.url };
}

// Registered at the top level, so Firefox wakes the background page for it.
chrome.webRequest.onHeadersReceived.addListener(
  onHeaders,
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame", "sub_frame"] },
  ["blocking", "responseHeaders"],
);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "bypassOnce" || typeof message.url !== "string") return;
  if (sender.id !== chrome.runtime.id) return;
  clearTimeout(bypass.get(message.url));
  bypass.set(message.url, setTimeout(() => bypass.delete(message.url), 8000));
  sendResponse(true);
});
