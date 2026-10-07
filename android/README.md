# Android package (Google Play)

The Android app is the web app inside a Trusted Web Activity: Chrome shows
https://smart-dark-app.vercel.app full screen, with the app's own icon and no address bar.
`twa-manifest.json` describes it for [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap), Google's
tool for this. The workflow "Google Play package" on GitHub builds the package; nothing has to be installed
on a computer. Steps, listing text and pictures: `docs/store/google-play.md`.

The Android project itself is not kept here: Bubblewrap writes it from `twa-manifest.json` on every build.
