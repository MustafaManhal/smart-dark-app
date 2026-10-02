# Research notes (2026-10-02)

## Market

| Extension | Approach | Users |
|---|---|---|
| [True Dark Mode for PDF Viewer](https://chromewebstore.google.com/detail/true-dark-mode-for-pdf-vi/koglagiofahlgnfmpnolhopklfcakeih) | Own viewer, "smart invert" keeps images | ~1,000 (4.5★, 13 ratings) |
| [Force Dark Mode – ThemeSwitcher](https://chromewebstore.google.com/detail/force-dark-mode/kmhhphbakbhohiohagkhhgdgfbplkfke) | General dark mode + local PDF renderer | ~1,000 |
| [PDF Dark Mode](https://chromewebstore.google.com/detail/pdf-dark-mode/dnommpggnhhbockchlalbelfgaooahba) | Filter over Chrome's viewer (invert only, per its own listing) | — |
| [Night PDF](https://github.com/midhunann/night-pdf) | `backdrop-filter: invert(1) hue-rotate(180deg)` overlay | ~7 |
| [PDF Color Inverter](https://chromewebstore.google.com/detail/pdf-color-inverter/opiegflllmnokfkmiklckbaigggjmnln) | invert + hue-rotate, images not skipped | — |
| Dark Reader | invert for PDFs | large, but PDFs are a side feature |

Chrome's built-in viewer (PDFium) renders inside a closed plugin, so an extension can only filter the whole
page. Keeping photos intact requires replacing the viewer. `invert + hue-rotate(180deg)` keeps hues
approximately but still flips photos and distorts saturation; that is the gap this project targets.

## Technical decisions (verified)

- **Interception**: same as Mozilla's official pdf.js Chrome extension
  ([pdfHandler.js](https://github.com/mozilla/pdf.js/blob/master/extensions/chromium/pdfHandler.js)):
  dynamic `declarativeNetRequest` rules with `responseHeaders` conditions on `content-type: application/pdf`,
  redirect via `regexSubstitution: VIEWER_URL + "?DNR:\\0"`, skip POST, respect
  `content-disposition: attachment` in sub-frames. `responseHeaders` needs Chrome 128+
  ([DNR docs](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)).
  Redirect target must be listed in `web_accessible_resources`.
- **file://**: DNR only sees file URLs when the user enables "Allow access to file URLs". Fallback is
  the viewer's Open-file button and drag-and-drop, which need no permission.
- **Permissions**: `<all_urls>` triggers the "Broad Host Permissions" in-depth review
  ([review process](https://developer.chrome.com/docs/webstore/review-process)). Plan: declare it as
  `optional_host_permissions` and request it from a welcome page, so install shows no warning.
  `declarativeNetRequestWithHostAccess` adds no install warning on its own.
- **pdf.js**: Apache-2.0. Modern build targets only the latest browsers; legacy build supports Chrome 125+
  ([FAQ](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)). We ship the legacy, non-minified
  build so reviewers can read it. MV3 CSP needs `'wasm-unsafe-eval'` for pdf.js image decoders, same as the
  official extension manifest. No `eval`/`new Function` in the worker build.
- **Image detection**: pdf.js 6 `page.render({ recordImages: true })` exposes `imageCoordinates`
  (normalized parallelograms of every drawn image XObject; image masks such as stencil glyphs are not
  recorded). Used to keep photos in their real colors.

## Store policy checklist

- Single purpose: view PDFs in a readable dark theme.
- Minimum permissions, each with a written justification.
- No remote code: pdf.js bundled.
- Privacy policy required if handling user data; we process files locally and send nothing.
- No keyword spam; no use of "Chrome"/"Google" branding in the name.
