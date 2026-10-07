# Firefox Add-ons (addons.mozilla.org)

Developer Hub: https://addons.mozilla.org/developers/ (a Firefox account, free).
Upload `reader343-firefox-<version>.zip`, made by `npm run package`. Choose "On this site".

## How the Firefox build differs

Firefox has no rule condition for response headers in `declarativeNetRequest`
([MDN compatibility data](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/RuleCondition):
`responseHeaders` is Chrome 128 and later, not Firefox). The Chrome build depends on it to recognize PDFs.
The Firefox build has its own background script, `src/background.firefox.js`, which reads the content type
with `webRequest` and sends PDF responses to the viewer. `scripts/build.mjs` writes the Firefox manifest:

- `background.scripts` in place of `background.service_worker` (Firefox does not run service workers for
  extensions)
- permissions `storage`, `webRequest`, `webRequestBlocking`
- `browser_specific_settings.gecko`: id `reader343@smart-dark-app`, `strict_min_version` 140.0, and
  `data_collection_permissions: { required: ["none"] }`, which Mozilla asks of every new extension since
  November 3, 2025
- no `incognito: "split"` and no `minimum_chrome_version`

Local files: Firefox gives extensions no way to catch `file://` addresses, so the welcome page leaves that
step out. The Open button and drag and drop work.

## Compatibility

Firefox for desktop, 140 and later. Untick Firefox for Android: the viewer was not tried there, and the
linter warns that the data declaration key needs a newer Android version.

## Listing

- **Name:** Reader343: Smart Dark PDF Reader
- **Summary** (250 characters at most):

```
Read PDFs in dark mode that keeps colors and photos intact. Text and pages go dark; red stays red, links stay blue, photos keep their real colors. Nothing leaves your device.
```

- **Description:** the description block from [chrome-web-store.md](chrome-web-store.md), with two changes:
  in the last list, replace "Open the same PDF in Chrome's built-in viewer" with "Open the same PDF in
  Firefox's built-in viewer".
- **Categories:** Appearance; Other (or the nearest the form offers)
- **Support website:** https://github.com/MustafaManhal/smart-dark-app/issues
- **Homepage:** https://smart-dark-app.vercel.app/about/
- **License:** MIT License
- **Privacy policy:** paste the text of `docs/PRIVACY.md`
- **Screenshots:** the three `store/screenshot-*.jpg` files. They were taken in Chrome; the viewer looks the
  same in Firefox.

## Data collection

The manifest declares `none`. In the form, confirm that the extension collects no data.

## Source code

Mozilla asks for source code only when the uploaded files were minified, bundled or generated. Nothing
here is: the extension's own scripts are uploaded as written, and PDF.js is the unminified legacy build.
Answer "No" to "Do you use any of the following: code generators or minifiers, tools that combine
multiple files, template engines, any other custom tool".

## Notes to the reviewer

```
Reader343 shows PDFs in a dark theme that keeps hues and photos.

Third-party code, unmodified:
- lib/pdfjs/pdf.mjs and pdf.worker.mjs: PDF.js 6.3.289, legacy build, from the npm package pdfjs-dist
  (https://github.com/mozilla/pdf.js, Apache-2.0). The linter's eval and innerHTML warnings are all
  inside these two files.
- lib/fonts/inter-latin-wght-normal.woff2: the Inter typeface (SIL OFL 1.1).

The package is assembled by copying files, with no bundler or minifier:
  git clone https://github.com/MustafaManhal/smart-dark-app && cd smart-dark-app
  npm ci && npm run package        (Node 22; writes reader343-firefox-<version>.zip)

webRequest and webRequestBlocking: background.firefox.js listens to onHeadersReceived for main_frame and
sub_frame requests and looks only at Content-Type and Content-Disposition, to send PDF responses to the
bundled viewer. Firefox has no declarativeNetRequest condition for response headers, which the Chrome
build uses for the same thing. Nothing is stored or sent.

Host access is optional and asked for on the welcome page.

To test: install, click "Allow access" on the welcome page, then open a PDF link such as
https://arxiv.org/pdf/1706.03762 . Press D in the viewer to compare with the original colors.
The welcome page also opens a bundled sample PDF that needs no permission.
```
