# Plan 6: Desktop app for macOS and Windows (done)

**Research (2026-10-03):** Electron 44 APIs checked in the installed typings (`protocol.handle`,
`registerSchemesAsPrivileged`, `open-file`, `second-instance`). electron-builder 26 supports ad-hoc
signing with `identity: "-"` when `hardenedRuntime: false` (its schema says so); an ad-hoc signed app gets
macOS's "Open Anyway" path, an unsigned one is reported as damaged. NSIS installers cross-built on Apple
Silicon have a corrupt uninstaller (electron-builder #10258), so Windows installers are built on Windows CI.

**Built:**
- `desktop/main.mjs`: serves `app-dist/` over `app://bundle/` with a strict Content Security Policy,
  context isolation + sandbox, links open in the system browser, window size remembered, menus
  (Open PDF…, recent documents, Library, Reading stats, Settings), PDFs opened by the OS (double-click,
  Open with, dock drop, command line, second instance) go straight to the reader, read-only update check
  against GitHub Releases (set `desktop.updateRepo` in package.json to turn it on).
- `desktop/preload.cjs`: the only bridge (`window.desktop`).
- macOS: hidden-inset title bar with room for the window buttons and a drag strip.
- `electron-builder.yml`: dmg + zip for Apple Silicon and Intel (ad-hoc signed), NSIS installer + zip for
  Windows (x64, arm64), AppImage for Linux, `.pdf` file association.
- `.github/workflows/desktop.yml`: builds all platforms on their own runners on a `v*` tag and drafts a
  GitHub release with the installers.

**Verified:** `codesign --verify --deep --strict` passes (ad-hoc); `syspolicy_check` reports only
"Adhoc Signed App"; the packaged app opens a PDF from the command line in smart dark; the Windows exe built
on macOS carries the product name, version and author. Desktop e2e (Playwright + Electron): security policy,
OS file open, menu navigation, update check, external links, packaged app.

**Not fixable without paying:** the macOS "Open Anyway" step needs an Apple Developer ID ($99/year) to go
away; the Windows SmartScreen warning needs a code-signing certificate.
