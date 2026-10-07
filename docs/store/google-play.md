# Google Play (Android)

Play Console: https://play.google.com/console (a developer account costs $25, once).

The Android app is the web app shown full screen by Chrome (a Trusted Web Activity). It is the same app as
https://smart-dark-app.vercel.app, with the same library on the phone, and it updates with the site.

Know before starting: Google asks new personal developer accounts to run a closed test with at least 12
testers for 14 days before an app can go public. Check the current rule in the Play Console when you sign up.

## Steps

1. **A signing key of your own.** On any computer with Java:
   `keytool -genkeypair -keystore upload.keystore -alias reader343 -keyalg RSA -keysize 2048 -validity 10000`
   Keep the file and its two passwords somewhere safe. Without them the app cannot be updated.
2. **Give the key to the build.** On GitHub: Settings, Secrets and variables, Actions, New repository secret.
   Three secrets:
   - `ANDROID_KEYSTORE_BASE64`: the output of `base64 -i upload.keystore`
   - `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD`: the two passwords
3. **Build.** Actions, "Google Play package", Run workflow. Download the artifact `reader343-google-play`:
   `app-release-bundle.aab` is for the Play Console, `app-release-signed.apk` installs straight on a phone.
4. **Create the app** in the Play Console (name Reader343, app, free) and upload the `.aab` to a test track.
5. **Connect the app to the site.** Play Console: Setup, App signing. Copy the SHA-256 fingerprint of the
   **app signing key** (Google's key, not your upload key). Put it into
   `app/public/.well-known/assetlinks.json`, which is `[]` today:

   ```json
   [{
     "relation": ["delegate_permission/common.handle_all_urls"],
     "target": {
       "namespace": "android_app",
       "package_name": "io.github.mustafamanhal.reader343",
       "sha256_cert_fingerprints": ["PASTE:THE:FINGERPRINT:HERE"]
     }
   }]
   ```

   Commit and push. Until this file is right, the app still works but shows a browser bar at the top.
6. Fill in the listing from this page, finish the test Google asks for, and send it for review.

The package name `io.github.mustafamanhal.reader343` is in `android/twa-manifest.json`. It can be changed
before the first upload, never after.

To raise the version for an update: `appVersionName` and `appVersionCode` (a whole number, one higher
each time) in `android/twa-manifest.json`.

## Store listing

**App name** (30 characters at most): `Reader343: Dark PDF Reader`

**Short description** (80 characters at most):

```
Read PDFs and e-books in a dark mode that keeps colors and photos.
```

**Full description** (4,000 characters at most): use the description from
[microsoft-store.md](microsoft-store.md), replacing "on your computer" with "on your phone", and leave out
the sentence about sync between computers and the line about natural voices (those are for computers).

**App icon** (512x512): `store/google-play/icon-512.png`

**Feature graphic** (1024x500): `store/google-play/feature-1024x500.png`

**Phone screenshots** (1080x1920): `store/google-play/1-reader.png` to `5-ebook.png`

**Category:** Books & Reference. **Tags:** PDF reader, e-book reader.

**Contact:** an email address is required and is shown to the public. Website:
https://smart-dark-app.vercel.app/about/

**Privacy policy:** https://smart-dark-app.vercel.app/about/privacy.html

## App content (the questionnaires)

- **Data safety:** no data is collected and none is shared. The app has no account and no analytics.
- **Ads:** none.
- **Target audience:** 13 and older is the simplest choice; the app has nothing aimed at children.
- **Content rating:** answer the questionnaire; a reader with no user-generated content shared with others.

## What was tried

The workflow built the package on GitHub with a key made for the run. Nobody has installed it on an
Android phone yet, and the web app itself has only been tried in desktop Chrome, in WebKit, and in the
desktop app. Install the `.apk` on a phone and read a book before going public.
