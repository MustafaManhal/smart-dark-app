# Show HN

Rules of the place: the title starts with "Show HN:", the thing can be tried without signing up, and the
first comment is the author's own account of what it is. Post on a weekday morning in US time, and stay
around to answer for the first hours. https://news.ycombinator.com/showhn.html

## Title (80 characters at most)

```
Show HN: Reader343, a PDF reader whose dark mode keeps colors and photos
```

## URL

```
https://smart-dark-app.vercel.app/about/
```

## First comment

```
I read a lot of PDFs at night, and every dark mode I tried inverts the page: text turns white, but red
turns cyan, charts become unreadable and photos turn into negatives.

Reader343 renders each page with PDF.js and recolors the pixels in OKLab: lightness is flipped, hue and
chroma are kept. Photos are found from PDF.js's image positions and left alone, while scans and
screenshots of text are darkened with the page. Colored text is lifted until it reaches WCAG AA contrast
on the dark background.

Around that it grew into a full reader: highlights, notes, pen drawings, a notebook across books with
export to Markdown, CSV and Anki, spaced review of your highlights (FSRS), read aloud that follows the
text, search across the library, OCR for scans (tesseract.js), form filling, and tools to join, split and
reorder pages.

Everything runs on the device. There is no account and no server: books and notes live in IndexedDB.
Sync between computers goes through a folder you pick (File System Access API), so your own iCloud,
Dropbox or OneDrive carries the files.

It is a web app (works offline, installs on iPhone from Safari), an Electron app for Windows and Mac,
and a browser extension that opens PDF links in the dark viewer. MIT licensed:
https://github.com/MustafaManhal/smart-dark-app

It also opens EPUB, MOBI, FB2 and CBZ through foliate-js, with the same dark page (there it is a CSS
filter that inverts the page and turns the hues back, applied twice to pictures so they stay as they are).

Things I know are missing: no sync for phones (that would need a server), the natural read-aloud voices
are English only, and e-books have fewer tools than PDFs (no drawing, no sticky notes).

I would like to hear where the recoloring gets a page wrong. A PDF that looks bad is the most useful
thing you can send me.
```

Check the list of missing things against the app on the day of posting, and drop what is no longer true.
