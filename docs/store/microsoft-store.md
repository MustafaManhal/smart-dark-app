# Microsoft Store (the desktop app)

Partner Center: https://partner.microsoft.com/dashboard . Registration for individual developers is free
([Windows blog, September 2025](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)).

The Store takes the app as an MSIX package and signs it itself. An app installed from the Store shows no
SmartScreen warning, which the installer from GitHub does.

## Steps

1. In Partner Center, create an app (MSIX or PWA app) and reserve the name **Reader343**.
2. Open **Product management, Product identity** and copy three values:
   `Package/Identity/Name`, `Package/Identity/Publisher` (it starts with `CN=`) and
   `Package/Properties/PublisherDisplayName`.
3. On GitHub, open **Actions, Microsoft Store package, Run workflow** and paste the three values.
   The run builds on Windows and takes about ten minutes.
4. Download the artifact `reader343-microsoft-store`. It holds `Reader343-<version>-win-x64.appx` and
   `Reader343-<version>-win-arm64.appx`.
5. Upload both `.appx` files under **Packages** in the submission and fill in the rest from this page.
6. Try it once before everyone gets it. The package is not signed until the Store signs it, so it
   cannot be installed by double click. Under **Pricing and availability, Visibility**, choose
   **Private audience** for the first submission and add your own Microsoft account to the group. When it
   is certified, install it from the Store link, check that a PDF opens from File Explorer, then change
   the visibility to Public and submit again.

The package settings are in `electron-builder.yml` (`appx:`), the tile pictures in `build/appx/`
(drawn by `scripts/make-icons.mjs`), the workflow in `.github/workflows/store-windows.yml`.

## Pricing and availability

- **Price:** Free
- **Markets:** all
- **Visibility:** Public

## Properties

- **Category:** Productivity
- **Privacy policy URL:** https://smart-dark-app.vercel.app/about/privacy.html
- **Website:** https://smart-dark-app.vercel.app/about/
- **Support contact info:** https://github.com/MustafaManhal/smart-dark-app/issues
- **System requirements:** none to declare

## Age ratings

Answer the questionnaire: no violence, no user-generated content shared with others, no purchases, no
personal information collected. The app reaches the internet only for the optional lookups named in the
privacy policy.

## Submission options: restricted capability

The package declares `runFullTrust`, as every packaged desktop app does. Partner Center asks why:

```
Reader343 is a desktop (Win32) application built with Electron and packaged as MSIX. Packaged desktop
applications run as full trust processes, so the runFullTrust capability is required for the app to start.
The app reads only the PDF files the user opens and keeps its library in its own app data folder.
```

## Store listing (English)

**Product name:** Reader343

**Short description:**

```
A PDF reader with a dark mode that keeps colors and photos. Highlight, take notes, listen to the book, and keep everything on your computer.
```

**Description:**

```
Reader343 is a PDF reader for people who read a lot.

Most dark modes for PDFs invert the whole page: black text turns white, but red turns cyan and every photo becomes a negative. Reader343 changes only how light or dark each color is and keeps its hue. White paper becomes a calm dark page, text becomes soft and light, charts keep their colors and photos stay photos. Scanned pages are darkened too.

Mark what matters. Highlight, underline or strike through text, write notes on a passage, stick notes on the page, draw with a pen, and bookmark pages. Everything you marked is listed in one panel beside the page and in a notebook for all your books, which exports to Markdown, a spreadsheet or Anki cards. A daily review brings your highlights back before you forget them.

Listen. Read aloud follows the text on the page, skips page numbers and running headers, and has natural English voices as an optional download.

Find things. Search inside a book or across your whole library, jump through the contents, follow links and come back, and get contents made for PDFs that have none. Text in scanned pages can be recognized on your computer, in English and Arabic.

Work with the file. Fill in forms and sign them, save a copy with your highlights inside, print, and use the PDF tools to join files, split them, reorder, turn or remove pages, or turn pictures into a PDF.

Private by design. There is no account. Your books, notes and reading history stay on your computer. You can sync between your own computers through a folder you choose, and back up everything to one file.

The interface is in English and Arabic. Reader343 is free and open source.
```

**What's new in this version:** `First release in the Microsoft Store.`

**Product features** (each 200 characters at most):

```
Dark pages that keep the colors of charts, links and photos
Five dark themes, a sepia page, and sliders for brightness and contrast
Highlights, underlines, notes, sticky notes, pen drawings and bookmarks
A notebook of everything you marked, with export to Markdown, CSV and Anki
Read aloud that follows the text, with optional natural voices
Search inside a book and across the library
Text recognition for scanned pages, on your computer
Fill in forms, sign, print, and save a copy with your marks
Join, split, reorder and turn pages; pictures to PDF
No account: books and notes stay on your computer
English and Arabic
```

**Screenshots** (PNG, 1920x1080): `store/microsoft/1-reader.png` to `5-pdf-tools.png`, in that order.
Captions (200 characters at most):

```
1. Dark pages with their real colors
2. Highlights and notes, listed beside the page
3. Page styles and fine-tuning
4. Your library, with the book you are reading
5. PDF tools: join, split, reorder and turn pages
```

**Store logos, 1:1 app tile icon (300x300):** `store/logo-300.png`

**Search terms** (seven at most):

```
pdf reader
dark mode pdf
pdf viewer
pdf highlighter
read aloud pdf
pdf notes
pdf editor
```

**Copyright and trademark info:** `Copyright © 2026 Mustafa Manhal. MIT License.`

**Additional license terms:** leave empty, or paste https://github.com/MustafaManhal/smart-dark-app/blob/main/LICENSE

## Notes for certification

```
Reader343 is a PDF reader. No account or sign-in is needed.
To test: start the app, choose "Open the sample book" on the welcome screen, or add any PDF.
PDF files can also be opened with the app from File Explorer (Open with).
Optional features that use the internet are off until the user turns them on; see the privacy policy.
```
