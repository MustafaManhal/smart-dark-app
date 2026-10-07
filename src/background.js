import { getSettings, onSettingsChanged, VIEWER_PATH } from "./shared/settings.js";

// PDF interception rules. Adapted from Mozilla's pdf.js Chrome extension
// (extensions/chromium/pdfHandler.js, Apache-2.0). The responseHeaders
// condition needs Chrome 128+, which the manifest requires.
//
// Rules only act on sites the user granted access to (optional <all_urls>),
// because we use declarativeNetRequestWithHostAccess.
function buildRules() {
  const ignore = { type: "allow" };
  const redirect = {
    type: "redirect",
    // DNR cannot encode the match, so the raw URL follows "?DNR:" and the
    // viewer parses it back out.
    redirect: { regexSubstitution: chrome.runtime.getURL(VIEWER_PATH) + "?DNR:\\0" },
  };
  const frames = ["main_frame", "sub_frame"];
  const pdfTypes = ["application/pdf", "application/pdf;*"];
  const octet = ["application/octet-stream", "application/octet-stream;*"];

  const rules = [
    // Local PDFs (only seen when "Allow access to file URLs" is on).
    { condition: { regexFilter: "^file://.*\\.[pP][dD][fF]$", resourceTypes: frames }, action: redirect },
    // Embedded PDFs that the site wants downloaded.
    {
      condition: {
        urlFilter: "*",
        resourceTypes: ["sub_frame"],
        responseHeaders: [{ header: "content-disposition", values: ["attachment*"] }],
      },
      action: ignore,
    },
    // Download links such as Google Drive "?export=download".
    {
      condition: {
        urlFilter: "=download",
        resourceTypes: ["main_frame"],
        responseHeaders: [{ header: "content-disposition", values: ["attachment*"] }],
      },
      action: ignore,
    },
    // Regular PDFs. POST responses cannot be fetched again, so leave them alone.
    {
      condition: {
        regexFilter: "^https?://.*$",
        excludedRequestMethods: ["post"],
        resourceTypes: frames,
        responseHeaders: [{ header: "content-type", values: pdfTypes }],
      },
      action: redirect,
    },
    // Wrong MIME type, but the URL names a .pdf file.
    {
      condition: {
        regexFilter: "^https?://.*\\.[pP][dD][fF]\\b.*$",
        excludedRequestMethods: ["post"],
        resourceTypes: frames,
        responseHeaders: [{ header: "content-type", values: octet }],
      },
      action: redirect,
    },
  ];

  // Highest priority first.
  return rules.map((rule, i) => ({ ...rule, id: i + 1, priority: rules.length - i }));
}

async function syncRules() {
  const { autoOpen } = await getSettings();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: autoOpen ? buildRules() : [],
  });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await syncRules();
  if (reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
});

chrome.runtime.onStartup.addListener(syncRules);

onSettingsChanged((patch) => {
  if ("autoOpen" in patch) syncRules();
});

// "Open in built-in viewer": let exactly this URL through once. The viewer
// navigates right after we answer; the rule is removed a few seconds later so
// the next visit opens in Reader343 again.
const BYPASS_RULE_ID = 1;
let bypassTimer;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "bypassOnce" || typeof message.url !== "string") return;
  if (sender.id !== chrome.runtime.id) return;
  const escaped = message.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  chrome.declarativeNetRequest
    .updateSessionRules({
      removeRuleIds: [BYPASS_RULE_ID],
      addRules: [{
        id: BYPASS_RULE_ID,
        priority: 100,
        action: { type: "allow" },
        condition: { regexFilter: `^${escaped}$`, resourceTypes: ["main_frame"] },
      }],
    })
    .then(() => {
      clearTimeout(bypassTimer);
      bypassTimer = setTimeout(() => {
        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [BYPASS_RULE_ID] });
      }, 8000);
      sendResponse(true);
    })
    .catch((error) => {
      console.warn("Could not add bypass rule", error);
      sendResponse(false);
    });
  return true;
});
