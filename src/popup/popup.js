import { THEMES, IMAGE_MODES } from "../viewer/smart-invert.js";
import {
  getSettings,
  setSettings,
  hasSiteAccess,
  requestSiteAccess,
  viewerUrlFor,
} from "../shared/settings.js";

const $ = (id) => document.getElementById(id);

function fillSelect(select, entries) {
  for (const [value, label] of entries) select.add(new Option(label, value));
}

async function refreshAccess() {
  const { autoOpen } = await getSettings();
  const granted = await hasSiteAccess();
  $("accessNote").hidden = !autoOpen || granted;
}

async function init() {
  fillSelect($("theme"), Object.entries(THEMES).map(([k, t]) => [k, t.label]));
  fillSelect($("imageMode"), Object.entries(IMAGE_MODES));

  const settings = await getSettings();
  $("enabled").checked = settings.enabled;
  $("autoOpen").checked = settings.autoOpen;
  $("theme").value = settings.theme;
  $("imageMode").value = settings.imageMode;
  await refreshAccess();

  $("enabled").addEventListener("change", (e) => setSettings({ enabled: e.target.checked }));
  $("theme").addEventListener("change", (e) => setSettings({ theme: e.target.value, enabled: true }));
  $("imageMode").addEventListener("change", (e) => setSettings({ imageMode: e.target.value }));

  $("autoOpen").addEventListener("change", async (e) => {
    const on = e.target.checked;
    // Ask before any await: permissions.request needs the click gesture.
    // It resolves true at once when access is already granted.
    if (on) await requestSiteAccess();
    await setSettings({ autoOpen: on });
    refreshAccess();
  });

  $("grantAccess").addEventListener("click", async () => {
    await requestSiteAccess();
    refreshAccess();
  });

  $("openViewer").addEventListener("click", () => {
    chrome.tabs.create({ url: viewerUrlFor() });
    window.close();
  });
}

init();
