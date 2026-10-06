# HeadTTS (vendored)

The text-to-speech worker of [HeadTTS](https://github.com/met4citizen/HeadTTS) 1.3.0 by Mika Suominen,
MIT license (see `LICENSE`). Files are unchanged copies from the npm package `@met4citizen/headtts@1.3.0`:

- `modules/worker-tts.mjs`, `utils.mjs`, `language.mjs`, `language-en-us.mjs`: the worker and its English
  pronunciation rules.
- `dictionaries/en-us.txt`: pronunciation dictionary, based on the CMU Pronouncing Dictionary (BSD).

They are kept here instead of installed from npm because the package's install script does not run on
Windows, where the desktop app is built. `scripts/copy-tts-assets.mjs` copies them into the app.

To update: replace these files with the ones from a newer package version and run the read-aloud tests.
