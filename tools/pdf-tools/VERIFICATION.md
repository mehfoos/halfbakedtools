# Verification log

What the tool relies on, what it was checked against, and when.

## Numbers

| Item | Status | Checked against | Date |
|---|---|---|---|
| 1 PDF point = 1/72 inch (used to size image pages and page images) | Not yet checked | Needs the PDF standard (ISO 32000) archived in `sources/`; download was blocked from the build environment | – |
| 1 inch = 0.0254 m (BMP resolution field) | Not yet checked | Needs an archived source | – |

## Behaviour: automated (`npm test`, every change)

| Item | Test |
|---|---|
| Page-range text: pages, ranges, open and reverse ranges, rejection of bad input | `core.test.ts` "ranges: …" |
| Add/remove source; move, duplicate, remove, rotate, resize pages | `core.test.ts` "session: …" |
| Split plans (one file, every N, chosen ranges, one per page) and file names | `core.test.ts` "session: planFiles…" |
| Settings file round trip; rejection of foreign, damaged and newer files; no content keys | `core.test.ts` "settings: …" |
| Written PDFs: merge order, repeated pages independent, rotation adds to existing, resize, image pages, several files from one builder, fonts kept | `core.test.ts` "build: …" |
| BMP writer; text joining; JPEG orientation note | `core.test.ts` "bmp", "text", "exif" |
| No network APIs in the tool's code; no off-site loads in pages; security policy present and strict | `privacy.test.ts` |

## Behaviour: end-to-end run in a browser

Run on 2026-11-16 against the production build in headless Chrome (desktop size), driving the page with a script
and checking the downloaded files with independent software (pypdf for PDFs, Pillow for images). Test files were
small generated PDFs and images. **Not yet run:** Firefox, Safari, phones, large or complex real-world PDFs.

| Item | Result |
|---|---|
| Add 2 PDFs + 1 PNG; previews drawn | Pass |
| Rotate, duplicate, move to position, remove, resize to 200%, undo; saved PDF has the expected pages, sizes, rotations and text | Pass |
| Split one-per-page and by chosen ranges (zip contents and page counts) | Pass |
| Extract selected pages | Pass |
| Save pages as PNG, JPEG, WebP, TIFF, BMP (each opens, expected pixel size at 72 dpi) | Pass |
| Save as text; pages without text counted and reported | Pass |
| Settings file: save, start again, load, placeholders shown, re-add files in a different order; same arrangement, and a saved PDF with the same pages, sizes, rotations and text | Pass |
| Images to PDF from JPEG (with orientation note), TIFF, BMP | Pass |
| Password-protected PDF: wrong then right password; output opens without a password and the page says so | Pass |
| Author-locked PDF (no open password) | Pass |
| Unsupported file gives a plain error | Pass |
| Requests made by the page: same-origin GETs only | Pass |
| Deliberate `fetch` and image request to another site from the page | Blocked by the browser |
| Drag-and-drop reordering and dropping files onto the page | **Not yet checked** (buttons and file picker were used) |
