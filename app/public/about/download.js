// Marks the download that fits the visitor's device and points the main button at it.
// Nothing is sent anywhere: the device is read from what the browser says about itself.
(() => {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? "ios"
    : /Android/.test(ua) ? "android"
    : /Windows/.test(ua) ? "win"
    : /Macintosh|Mac OS X/.test(ua) ? "mac"
    : /Linux|X11/.test(ua) ? "linux" : "";
  if (!os) return;
  const card = document.querySelector(`article[data-os="${os}"]`);
  card?.classList.add("is-yours");
  const note = document.getElementById("best-note");
  const text = note?.dataset[os];
  if (note && text) {
    note.textContent = text;
    note.hidden = false;
  }
  const best = document.getElementById("best");
  const link = card?.querySelector("a.btn.primary");
  if (best && link && (os === "win" || os === "mac" || os === "linux")) {
    best.href = link.href;
    best.textContent = link.textContent;
  }
})();
