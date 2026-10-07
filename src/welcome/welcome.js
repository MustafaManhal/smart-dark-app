import { hasSiteAccess, requestSiteAccess, viewerUrlFor } from "../shared/settings.js";

const $ = (id) => document.getElementById(id);

async function refresh() {
  const granted = await hasSiteAccess();
  $("grantAccess").hidden = granted;
  $("accessDone").hidden = !granted;
}

$("grantAccess").addEventListener("click", async () => {
  await requestSiteAccess();
  refresh();
});

$("openSettings").addEventListener("click", () => {
  chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
});

$("openSample").addEventListener("click", () => {
  location.href = viewerUrlFor(chrome.runtime.getURL("sample/sample.pdf"));
});

// Firefox has no switch for local files: there the Open button and drag and drop are the way.
if (location.protocol === "moz-extension:") $("stepFiles").hidden = true;

refresh();
