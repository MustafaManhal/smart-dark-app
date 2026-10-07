# Store packages

Everything a store asks for is prepared here. What is left for each store is the part only the owner can
do: open the developer account, pay the fee where there is one, paste the texts, upload the files, submit.

| Store | Package | Made by | Account and fee | Listing text |
|---|---|---|---|---|
| Chrome Web Store | `reader343-extension-<version>.zip` | `npm run package` | Google account, $5 once | [chrome-web-store.md](chrome-web-store.md) |
| Edge Add-ons | the same zip | `npm run package` | Microsoft Partner Center, free | [edge-addons.md](edge-addons.md) |
| Firefox Add-ons | `reader343-firefox-<version>.zip` | `npm run package` | Firefox account, free | [firefox-addons.md](firefox-addons.md) |
| Microsoft Store | `Reader343-<version>-win-x64.appx` and `-arm64.appx` | the "Microsoft Store package" workflow on GitHub | Microsoft Partner Center, free for individuals | [microsoft-store.md](microsoft-store.md) |

The zip files and the `.appx` files are not kept in the repository. Make them fresh before uploading.

## Pictures

All in `store/`. `npm run store-assets` makes them again after the look of the app changes.

| File | Size | Used by |
|---|---|---|
| `screenshot-1-smart-dark.jpg`, `screenshot-2-before-after.jpg`, `screenshot-3-paper.jpg` | 1280x800 | Chrome, Edge, Firefox (the extension) |
| `promo-small-440x280.jpg` | 440x280 | Chrome and Edge small promotional tile |
| `logo-300.png` | 300x300 | Edge extension logo, Microsoft Store app tile icon |
| `microsoft/1-reader.png` to `5-pdf-tools.png` | 1920x1080 PNG | Microsoft Store (the desktop app) |
| `src/icons/icon128.png` | 128x128 | Chrome store icon |

## Addresses to paste

- Privacy policy: https://smart-dark-app.vercel.app/about/privacy.html
- Website: https://smart-dark-app.vercel.app/about/
- Support: https://github.com/MustafaManhal/smart-dark-app/issues
- Source: https://github.com/MustafaManhal/smart-dark-app

## Before every upload

1. Raise `version` in `src/manifest.json` (extension) or `package.json` (desktop app). Stores refuse a
   version they have seen.
2. Run the tests: `npm test`, `npm run e2e`, `npm run e2e:firefox` for the extension; `npm run app:test`,
   `npm run app:e2e`, `npm run desktop:e2e` for the app.
3. Make the package and upload it.

## What was tried and what was not

- The Chrome build runs in Chrome in `npm run e2e` (14 checks). Edge takes the same package; it was not
  run in Edge itself.
- The Firefox build passes Mozilla's own linter (`npx addons-linter dist-firefox`) with no errors. The
  "Extension" workflow on GitHub runs it in a real Firefox (`test/e2e/firefox.mjs`); look at its last run
  before uploading.
- The Microsoft Store package is built by the workflow on a Windows machine of GitHub. Nobody has
  installed that package on Windows yet. Install it once from the workflow's download before submitting
  (see microsoft-store.md).
- No store has seen any of this. A reviewer may still ask for changes.
