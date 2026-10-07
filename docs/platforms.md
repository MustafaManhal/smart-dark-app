# What each app can do, and how that is known

Checked on 2026-10-07 at the owner's request ("check if all the features are applied to all the apps").
The public version of this table is on the download page (`app/public/about/download.html`); keep the two
the same.

All the apps except the extension are one program, the web app in `app/`, in different shells. A feature
built once is in all of them unless the system under it lacks something. The extension is a separate, small
program: the dark viewer only.

| Shell | What it is | Gets new features by |
|---|---|---|
| Web app | https://smart-dark-app.vercel.app | every push to `main` |
| Installed web app (Chrome, Edge, iPhone Home Screen, Android) | the same site, in its own window | the same push; its offline copy takes over on the visit after |
| Desktop app (Windows, Mac, Linux) | Electron around the built web app | a release, which the workflow "Desktop app" makes by itself on every push to `main` that touches the app; the app's update check then offers it |
| Google Play package | a Trusted Web Activity: Chrome showing the site | the same push as the site |
| App Store project | Capacitor around the built web app | a new upload to Apple |
| Extension (Chrome, Edge, Firefox) | `src/`, its own viewer | a new upload to each store |

## Features

| Feature | Chrome or Edge on a computer | Safari, Firefox | Desktop app | iPhone, iPad | Android | Extension |
|---|---|---|---|---|---|---|
| Dark pages that keep colors | yes | yes | yes | yes | yes | yes |
| Marks, notes, drawing, bookmarks | yes | yes | yes | yes | yes | no |
| Notebook, review, stats | yes | yes | yes | yes | yes | no |
| Read aloud, device voices | yes | yes | yes | yes | yes | no |
| Natural voices | yes | on computers | yes | no | no | no |
| E-books | yes | yes | yes | yes | yes | no |
| Text recognition | yes | yes | yes | yes | yes | no |
| PDF tools | yes | yes | yes | yes | yes | no |
| Forms, signature, print, save with marks | yes | yes | yes | yes | yes | no |
| Summarize, explain, translate | with the browser's model | no | no | no | no | no |
| Folder sync | yes | no | yes | no | no | no |
| Backup file | yes | yes | yes | yes | yes | no |
| "Open with" from the system | when installed | no | yes | no | no | no |
| Opens PDF links of the web | no | no | no | no | no | yes |
| Offline | yes | yes | yes | yes | yes | yes |

## Why the "no" cells are "no"

- **Summaries and translation** use the model that Chrome and Edge carry on computers
  (`ai/builtin.ts`, `checkAi`). No other browser has one, and Electron does not ship it.
- **Folder sync** needs the File System Access API (`showDirectoryPicker`), which only Chrome and Edge on
  computers and Electron have. Elsewhere the backup file does the moving.
- **Natural voices** are a 102 MB model that phones are kept from (`naturalSupported` in
  `readaloud/neural.ts`).
- **"Open with"**: the web manifest's `file_handlers` work in Chrome and Edge on computers. The iPhone
  project has no native code for it yet (`docs/store/app-store.md`).
- **The extension** has none of the reader's features on purpose: it is the viewer that opens PDF links
  in the tab. Its popup and welcome page now point to the app for the rest.

## How each cell is known

| Shell | Evidence | Not yet tried |
|---|---|---|
| Chrome | `npm run app:e2e`, project chromium-desktop: every feature has tests | the browser's real model (tests use a stand-in) |
| Safari's engine, iPhone size | the same suite, project webkit-iphone | a real iPhone (`docs/iphone-checklist.md`) |
| Firefox | workflow "Web app in Firefox": 68 tests of the main journeys passed on 2026-10-07 (library, reader, marks, drawing, forms, search, e-books, PDF tools, notebook, backup, settings, the shell) | what those 13 test files do not cover: read aloud, text recognition, word lookup, stats |
| Desktop app | `npm run desktop:e2e`: opening PDFs and EPUBs from the system, the shell, the toolbar, PDF tools, text recognition, natural voices, folder sync, the update check | Windows and Linux builds are made by CI and not started by a test |
| Android | none: it is the site in Chrome | an Android phone |
| App Store project | workflow "iPhone app": builds, starts in a simulator, picture of the first screen | every feature inside the shell; saving and sharing files there is the likeliest gap |
| Extension, Chrome | `npm run e2e` (14 checks) | Edge |
| Extension, Firefox | workflow "Extension" (4 checks through the test server) | its viewer's own controls, which Firefox's automation cannot reach |
