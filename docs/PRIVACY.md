# Reader343: Privacy Policy

Last updated: October 7, 2026

Reader343 is a PDF reader: a web app, a desktop app for Windows and Mac, an app for the iPhone home screen,
and a browser extension for Chrome, Edge and Firefox. It was called Smart Dark PDF Reader before.

There is no account, no analytics, no advertising and no tracking. Your books, notes and reading history
are kept on your device. The developer receives nothing from the app or the extension.

The same text is published at https://smart-dark-app.vercel.app/about/privacy.html

## What is kept on your device

- The PDF files you add, their covers, and where you stopped reading.
- Your highlights, notes, sticky notes, bookmarks, drawings, filled form fields and signature.
- Reading history (which pages, for how long), goals and review schedules.
- Your settings.
- The password of a protected PDF, so the book opens next time. It is not put in backups or in a sync folder.

Removing a book removes its marks with it. Clearing the site's data in the browser, or removing the app,
removes everything.

## When something leaves your device

The app works without a connection after the first visit. It connects only in these cases:

- **Loading the app.** The web app is served from smart-dark-app.vercel.app. Like any web server, the host
  (Vercel) sees your internet address and which files were asked for. No book and no note is part of that.
- **Book details lookup** (off until you turn it on). When you search for a title, the text you type is sent
  to Open Library and Google Books, and cover pictures come from them.
- **Word lookup** (off until you agree, the first time you ask for a meaning). The selected word is sent to
  en.wiktionary.org.
- **Natural voices for read aloud** (an optional download on computers). The speech model, about 102 MB,
  comes from the app's own site; if that fails, from Hugging Face, which then sees your internet address as
  with any download. Speech is made on your device. The text that is read is not sent anywhere.
- **Text recognition for scanned pages.** The recognition engine and its language files come from the app's
  own site. Recognition runs on your device. The pages are not sent anywhere.
- **Summaries, explanations and translations** use the model built into your browser (Chrome and Edge on
  computers), on your device. The browser may download that model from its maker. Reader343 sends the text
  to nobody.
- **Sync through a folder** (off until you choose a folder). The app writes your books, marks and reading
  places as files into the folder you chose, and reads the files other computers of yours wrote there. If
  that folder belongs to a service such as iCloud Drive, Dropbox or OneDrive, that service carries the files
  under its own privacy policy. The app itself makes no connection for this.
- **Backups, saved PDFs and shared quotes** go where you save or share them.
- **The desktop app's update check** asks GitHub for the number of the newest release when the app starts
  (once a day) and when you press "Check for updates". "Update now" downloads the new installer from
  GitHub. Nothing about you or your books is part of either. The check at start can be turned off in
  Settings.

## The browser extension

- **PDF files you open.** When you open a PDF link, the extension downloads that PDF from the website, the
  same way the browser's own viewer does, and draws it on your screen. PDFs are processed only in your browser.
- **Preferences.** Theme, image handling, contrast, and whether PDFs open automatically are saved with the
  browser's `storage.sync`, so they follow your browser profile if you use its sync. They hold no personal
  information and no document content.
- **Access to websites** is optional and granted by you. It is needed to send PDF links to the viewer and to
  download the PDF you are viewing. You can withdraw it at any time on the extension's page in the browser.
- In Chrome and Edge the extension uses `declarativeNetRequestWithHostAccess` to send PDF responses to its
  viewer. In Firefox it uses `webRequest` for the same purpose: it looks at the content type of a response to
  tell whether it is a PDF. Nothing else about the pages you visit is read, kept or sent.
- The extension has no analytics, no remote code, and does not read or change web pages.

## What is never done

- Your documents, their text, your notes and your reading history are not sent to the developer or sold or
  shared with anyone.
- No advertising or analytics code is included.

## Children

The app and the extension collect no personal information from anyone, children included.

## Changes

If this policy changes, the date at the top changes with it, and the new text is published at the address above.

## Contact

Questions about this policy: open an issue at https://github.com/MustafaManhal/smart-dark-app/issues
