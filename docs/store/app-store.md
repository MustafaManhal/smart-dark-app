# App Store (iPhone and iPad)

Apple Developer Program: https://developer.apple.com/programs/ ($99 a year). A Mac with Xcode is needed to
make and upload the package.

The iPhone app is the web app inside a small native shell (Capacitor, project in `ios/`). The books and
notes live inside the app on the phone. Unlike the Android app it does not load the site: every update
is a new upload to Apple.

The free way stays what it is today: open https://smart-dark-app.vercel.app in Safari and choose
Share, Add to Home Screen. The App Store listing adds a place where people look for apps, for $99 a year.

Know before starting: Apple turns down apps that are only a web page in a frame (guideline 4.2). This app
carries all its files, works offline and reads the user's own documents, which is what Apple asks of such
apps, but the decision is the reviewer's.

## Steps

1. Once: finish Xcode's setup with `sudo xcodebuild -runFirstLaunch` (on this Mac it was never run, so
   Xcode cannot build yet).
2. `npm ci`, then `npm run ios:sync`. That builds the web app, prepares it (`scripts/ios-prepare.mjs`) and
   copies it into the Xcode project.
3. `npx cap open ios`. In Xcode: select the App target, Signing & Capabilities, choose your team. The
   bundle identifier is `io.github.mustafamanhal.reader343` (it can be changed before the first upload,
   in `capacitor.config.json` and in Xcode).
4. Run it on your own iPhone first (plug it in, choose it as the destination, press Run). Go through
   `docs/iphone-checklist.md`.
5. Product, Archive, then Distribute App, App Store Connect.
6. In App Store Connect (https://appstoreconnect.apple.com) create the app, fill in the listing from this
   page, choose the uploaded build, and submit for review.

To raise the version for an update: MARKETING_VERSION and CURRENT_PROJECT_VERSION in Xcode (App target,
General).

## What the shell does not do yet

- A PDF in the Files app or in Mail cannot be sent to Reader343 with "Open in". Books are added from inside
  the app with Add PDF. Adding that needs a little native code and was left for after a first listing.
- Natural read-aloud voices are left out, as in the web app on phones. The device's voices are used.

## Store listing

**Name** (30 characters at most): `Reader343: Dark PDF Reader`

**Subtitle** (30 characters at most): `PDFs in dark, colors kept`

**Promotional text** (170 characters at most):

```
Dark pages that keep photos and colors. Highlights, notes, read aloud and e-books. No account: your books stay on your iPhone.
```

**Description:** use the description from [microsoft-store.md](microsoft-store.md), replacing "on your
computer" with "on your iPhone", and leave out the sentence about sync between computers and the line
about natural voices.

**Keywords** (100 characters at most, separated by commas):

```
pdf,reader,dark mode,night,epub,ebook,highlight,notes,read aloud,annotate,viewer,scan,ocr,arabic
```

**Category:** Books (secondary: Productivity)

**Screenshots, 6.9-inch iPhone** (1290x2796): `store/app-store/1-reader.png` to `5-ebook.png`. They were
taken from the web app at that size, not from a phone. Replace them with real ones from your iPhone if a
reviewer objects to the missing status bar.

**Support URL:** https://github.com/MustafaManhal/smart-dark-app/issues
**Marketing URL:** https://smart-dark-app.vercel.app/about/
**Privacy policy URL:** https://smart-dark-app.vercel.app/about/privacy.html

**App privacy:** Data Not Collected.

**Age rating:** answer the questionnaire with "none" throughout. Unrestricted web access: no.

**Review notes:**

```
Reader343 is a document reader. No account is needed.
To test: tap "Try the sample book" on the first screen, or add any PDF or EPUB with "Add PDF".
All files of the app are inside the package and it works without a connection. Optional lookups that use
the internet are off until the user turns them on (see the privacy policy).
```

## What was tried

The workflow "iPhone app" on GitHub builds the project for the simulator, starts the app and keeps a
picture of its first screen. Nobody has run it on a real iPhone, and no archive was made (that needs the
paid account).
