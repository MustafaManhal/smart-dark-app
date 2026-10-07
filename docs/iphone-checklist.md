# Checklist for a real iPhone

Everything in the app was tested in WebKit, the engine of Safari, at the size of an iPhone 15, on a
computer. That catches most layout and engine problems. It does not catch what only a real phone has:
the keyboard, the share sheet, the notch and home bar, speech, memory limits, and touch.

Go through this once on an iPhone in Safari (https://smart-dark-app.vercel.app), once after
Share, Add to Home Screen, and once more in the App Store build if there is one. Note the iOS version.
Twenty minutes is enough. Write down the number of anything that fails.

## Install and start

1. Safari shows the line that says how to install. After Add to Home Screen, the app opens full screen
   with its own icon, and the line is gone.
2. Turn on airplane mode, close the app, open it again. The library and a book open.
3. Nothing sits under the notch or the home bar: the top bar, the tool row at the bottom, sheets.

## Books

4. Add PDF: the Files picker opens. Pick a PDF from iCloud Drive. Its cover appears.
5. Add an EPUB the same way. It opens in the e-book reader.
6. Add a large PDF (100 MB or 500 pages). The app does not reload or go blank while it is added or read.
7. A protected PDF asks for its password. The keyboard does not cover the field or the Open button.

## Reading

8. Scroll a long PDF fast. Pages appear without long blank gaps, and the page number follows.
9. Pinch to zoom in and out. The text becomes sharp again after a moment.
10. Rotate the phone. The page fits the new width and the place is kept.
11. Tap the middle of the page: the bars hide and come back.
12. Appearance: each page style shows at once. The sheet leaves the page visible above it.
13. E-book: swipe and tap the sides to turn pages. Change the text size.

## Marks

14. Select text with a long press. The app's bar appears below the selection and does not fight with
    iOS's own Copy / Look Up bubble.
15. Highlight, then tap the highlight and remove it with one tap.
16. Write a note. The keyboard does not cover what you type. Close it; the note is in the Notes list.
17. Place a sticky note, drag it, write in it.
18. Draw with a finger. Lines follow the finger without the page scrolling. With an Apple Pencil on an
    iPad, pressure changes the line.

## Read aloud

19. Press Read aloud. It speaks, and the words are followed on the page.
20. Lock the phone. Note whether it keeps speaking (iOS may stop it; that is a known limit of web apps).
21. Pause, resume, change the speed.
22. An Arabic page is read with an Arabic voice.

## Saving and sharing

23. Book menu, Save a copy: the share sheet opens with "Save to Files". The saved file opens in Files.
24. Save a copy with your marks: the same, and the highlights show in the Files preview.
25. Notebook, Export, Markdown: the share sheet opens with the file.
26. Share a quote as a picture: the share sheet shows the picture.
27. Back up and restore: make a backup, save it to Files, and restore it.
28. PDF tools: add two photos from the photo library, make a PDF, save it.

## Arabic

29. Settings, language, Arabic. The whole app flips to right to left. Numbers stay as 1 2 3.
30. Open the Arabic e-book or an Arabic PDF. Selection and highlights work.

## Space

31. Settings, Your data: the size shown looks right, and after a week of not opening the app the
    library is still there (Safari can clear a site's data after seven days without a visit; an app on
    the Home Screen is not cleared this way).
