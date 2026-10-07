# foliate-js (vendored)

The e-book renderer [foliate-js](https://github.com/johnfactotum/foliate-js) by John Factotum, MIT license
(see `LICENSE`). It has no npm package; its README says to copy it in. These files are from commit
`78914aef4466eb960965702401634c2cb348e9b1` (May 1, 2026).

Copied unchanged: `epub.js`, `epubcfi.js`, `progress.js`, `overlayer.js`, `text-walker.js`,
`fixed-layout.js`, `mobi.js`, `fb2.js`, `comic-book.js`, `search.js`, `tts.js`, and its own vendored
`vendor/zip.js` (zip.js, BSD-3-Clause) and `vendor/fflate.js` (fflate, MIT).

Changed: `view.js`. The branch that opens PDF files through foliate's own PDF.js adapter is removed
(`isPDF` and the `import('./pdf.js')`), because this app shows PDFs with its own reader and the adapter
needs a second copy of PDF.js.

Changed: `paginator.js`. `View.render` returns when the section's document has no body yet. A resize
that arrives while a section is loading used to throw there ("Cannot destructure property 'style'");
the layout is made anyway once the section has loaded. `getVisibleRange` returns nothing in the same
case, where it used to throw in `createTreeWalker`. Both changes are marked with "Reader343" in the file.

Left out: `pdf.js`, `opds.js`, `dict.js`, `footnotes.js`, `quote-image.js`, `uri-template.js`, the demo
reader (`reader.js`, `reader.html`, `ui/`), tests and build files.

Books are shown inside frames whose content comes from the book. The app's Content Security Policy
allows no script other than the app's own, so scripts inside a book do not run. Keep it that way: the
library's README warns against using it without such a policy.

To update: copy the same files from a newer commit, apply the change to `view.js` again, and run the
e-book tests (`test/app-e2e/ebook.spec.ts`).
