# Verification log

What the tool relies on, what it was checked against, and when.

## Numbers

| Item | Status | Checked against | Date |
|---|---|---|---|
| Default PDF unit = 1/72 inch (used to size image pages and page images) | Checked | PDF 32000-1:2008 (Adobe's edition of ISO 32000-1), section 8.3.2.3 "User Space", p. 115, and Table 30 (UserUnit), p. 79. Copy uploaded by the owner, SHA-256 `9de0ca9e8570d6209e8bd48a355be8eb6ec376acfc3fc3ae97cd8730351417ff`. **Not yet in `sources/`**: its copyright notice says permission to reproduce must be arranged with ISO, so the owner decided on 2026-11-16 not to commit it. There is therefore no `references.json` entry | 2026-11-16 |
| 1 inch = 0.0254 m (BMP resolution field) | Not yet checked | Needs an archived source | – |
| Grey conversion weights 0.299, 0.587, 0.114 (compression's "make pictures grey") | Not yet checked | Needs an archived source (ITU-R BT.601 is the usual attribution) | – |
| Compression presets (200/150/100/72 dots per inch; 80/65/50/30% quality; "Maximum" redraws pages at 72 dots per inch, 30%) | Not a sourced value | This tool's own choices | – |

## Behaviour: automated (`npm test`, every change)

| Item | Test |
|---|---|
| Page-range text: pages, ranges, open and reverse ranges, rejection of bad input | `core.test.ts` "ranges: …" |
| Add/remove source; move, duplicate, remove, rotate, resize pages | `core.test.ts` "session: …" |
| Split plans (one file, every N, chosen ranges, one per page) and file names | `core.test.ts` "session: planFiles…" |
| Crop: unit conversion, crop box on upright and turned pages, minimum visible area, chosen pages, settings; resizing keeps an already-cropped page's area | `core.test.ts` "crop: …", "build: crop …", "build: resizing keeps …" |
| Signature pad ink bounds | `core.test.ts` "signature: …" |
| Shape paths, placement on turned pages, checks on shapes/ink from settings files, drawing into the page | `core.test.ts` "shapes: …", "build: shapes …" |
| Paging of long page lists: whole rows that fit the screen, screen counts and ranges, short pager row | `core.test.ts` "perScreen…", "screen arithmetic", "pagerItems…" |
| Settings file round trip; rejection of foreign, damaged and newer files; no content keys | `core.test.ts` "settings: …" |
| Written PDFs: merge order, repeated pages independent, rotation adds to existing, resize, image pages, several files from one builder, fonts kept | `core.test.ts` "build: …" |
| Page numbers: text for every style, first number, first numbered page; placement by corner and margin; settings checks and older files; written by the builder only on the right pages, including a one-page preview | `core.test.ts` "numbers: …", "build: numbers…" |
| Watermark: one copy centred at any angle; repeated copies cover the page, staggered, capped; settings checks; written see-through on every page under the number; unsupported characters refused | `core.test.ts` "watermark: …", "build: the watermark…" |
| Protected output can't be opened without the password; rebuilding with the password gives an open copy; the settings file has no password field | `core.test.ts` "protect: …", "settings: no password…" |
| Default names carry a suffix on every task; name clashes found whatever the capitals | `core.test.ts` "names: …" |
| BMP writer; text joining; JPEG orientation note | `core.test.ts` "bmp", "text", "exif" |
| Added text and pictures: displayed position to PDF coordinates for all four page rotations and a shifted crop box; base view to turned view and back; text layout; picture placement; settings checks; marks written by the builder on plain and rotated pages; unsupported characters refused | `core.test.ts` "marks: …", "session: marks…", "build: added…", "build: the built-in fonts…" |
| Compression rules: detail estimate, target size, eligibility, row-prediction decoding, pixel conversion, stated saving; settings round trip and older files | `core.test.ts` "compress: …", "settings: compression…" |
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
| Same request from a worker started from a web address (how PDF.js was first wired up) | **Allowed**: the page's policy did not apply. Fixed the same day by starting the worker from a blob |
| Same request from a worker started from a blob; request to this site from that worker | Blocked; allowed |
| The page's only workers after opening a PDF are blob workers; previews still drawn | Pass |
| Drag-and-drop reordering and dropping files onto the page | **Not yet checked** (buttons and file picker were used) |

### Task pages (2026-11-16, same method, after the interface was split into one page per task)

| Item | Result |
|---|---|
| Home grid lists every task; each task page starts with one "select" button and shows only its own controls | Pass |
| Merge (PDFs; PDF + image), Split (one per page; chosen ranges), Extract, Remove pages, Rotate (all pages; ticked pages), Resize, Organise: saved PDFs have the expected pages, sizes and rotations | Pass |
| PDF to JPG, PDF to image (TIFF tried), PDF to text, Images to PDF (JPEG with orientation note, PNG, TIFF) | Pass |
| A task that takes only PDFs skips an image, and the reverse, with a plain message | Pass |
| Workspace: settings file saved, start again, loaded, file re-added, same result | Pass |
| Requests made by the pages: same-origin only | Pass |
| Compress PDF (generated files: a 2-page 300 dpi JPEG "scan", colour and grey, 5.5 MB; a text page with a 1600 x 1200 PNG-style picture, 1.9 MB). Recommended: 7.3 MB → 1.4 MB; scan pictures stored at 1240 x 1754 (150 dpi); page sizes and text unchanged, checked with pypdf | Pass |
| Strong (pictures 827 x 1169) and custom 72 dpi grey (595 x 842): smaller each time | Pass |
| "Turn whole pages into pictures": smaller; text gone, as warned | Pass |
| Extreme (7.3 MB → 237 kB; scan pictures 595 x 842; text kept) and Maximum (7.3 MB → 186 kB; text gone, warning shown) on the same generated files | Pass |
| "Tidy up only" and a text-only PDF: tool reports nothing gained and offers no download | Pass |
| Result panel shows the real size before download; changing a setting clears it | Pass |
| Workspace: merge two files with Light compression, direct download | Pass |
| Row-prediction (PNG predictor) pictures in a real PDF; black-and-white, CMYK and palette pictures being skipped | **Not yet checked** in a browser (rules are unit-tested) |
| Default file names differ from the original's on every task; a name matching an added file (any capitals) brings up a question and saves nothing until answered; Cancel saves nothing; "Save anyway" saves | Pass |
| Edit PDF: red text added, then every red pixel of the drawn page checked to fall inside the on-screen handle, on: a plain page; after dragging; text turned 90°; pages stored sideways (90° and 270°); a cropped page; a page turned in the tool before editing | Pass (all red pixels inside the handle in every case) |
| Edit PDF: picture added and resized by its corner; saved PDF contains the added text (pypdf) and picture; other pages untouched | Pass |
| Edit PDF: additions appear in PNG and text exports of the page | Pass |
| Edit PDF: a character the fonts lack (Ω) shows a warning, the page is still drawn, and saving is refused with the reason | Pass |
| Edit PDF: undo; settings file with additions and a placed picture saved, loaded, files re-added, same PDF content | Pass |
| Edit PDF on a phone or by touch; keyboard-only use of the editor | **Not yet checked** |
| Protect PDF: refuses an empty or mismatched password; the saved file is reported encrypted by pypdf and by qpdf (encryption revision 6, AES 256-bit), is rejected with no or a wrong password, and opens with the right one with all pages and text | Pass |
| Unlock PDF: files protected by this tool and by qpdf, opened with their passwords, are saved unencrypted with all pages; an author-locked file and an unprotected file each get a plain explanation | Pass |
| Page numbers: default, each corner tried in the preview, "Page n of total", start on page 2, first number 10, size and margin; positions read back from the saved PDFs with pypdf match the settings, on plain, sideways, cropped and tool-turned pages; two files numbered separately; off by default in the workspace; kept in the settings file | Pass |
| Watermark: default, repeated, full strength, level and smaller, shown in the preview; saved PDFs contain the words once per page (or several times when repeated) and keep the page's own text; sideways pages; two files; empty words and unsupported characters refused with a reason; off by default in the workspace; with page numbers together; kept in the settings file | Pass |
| Phone-width layout | Looked at in screenshots only; **not checked on a real phone** |

### Page lists and layout (2026-11-19)

Run in headless Chrome on a 300-page PDF, at 1280×800 and at 390×780 (phone size): whole-file tasks show no page
grid and a file list; page tasks show one screenful ("Pages 1–8 of 300"); the screen count stays the same from one
screen to the next; Select all (300) and Select none cover every screen; Move later follows the moved page to its
screen; "Pages per screen" changes the count; the main button was inside the screen (above its bottom edge) on
every task; no script errors and no requests to any other site. The earlier end-to-end suites (every task, compress,
edit, names, security, page numbers, watermark, extended compression levels) were re-run unchanged and pass.
Not checked: real phones, Firefox, Safari.

### Crop PDF (2026-11-19)

Headless Chrome on a three-page test PDF (one page stored turned 90°) with a red square at the stored top-left and
a blue square at the bottom-right. Margins typed in mm (top 20, left 10, right 5): the saved PDF's crop boxes were
read back with pypdf and matched the expected numbers on upright and turned pages; each page was then rendered by
poppler (`pdftoppm -cropbox`): page sizes shrank by exactly the margins, the red square disappeared, and the blue
square lost the expected 5 mm / 10 mm slice. Changing the unit kept the same margins (20 mm = 0.787 in). Dragging the
box's east and north edges changed the margins by the distance dragged (80 and 100 points); dragging an edge far past
the other stopped at the quarter-inch minimum. "Only the pages I choose" cropped only that page; a page range outside
the file gave the library's clear message; saving with no margins was refused with a message. Settings file
included the crop margins. No requests left the browser. Earlier suites were re-run and pass; Resize (50%) still
gives the right sizes after the page-box fix. Not checked: real phones (touch dragging), Firefox, Safari.

### Sign PDF (2026-11-19)

Headless Chrome: opened a PDF on the Sign page (editor opens on page 1), pressed Draw signature, an empty pad was refused
with a message, a two-stroke signature was drawn with the mouse (including Undo stroke), Use placed it as a movable,
resizable picture; the saved PDF was read with pypdf (one transparent RGBA picture on page 1, none on the others) and
rendered with poppler (dark-blue ink visible). No requests left the browser. Not checked: touch or pen input on real devices.

### Shapes, highlight and freehand (2026-11-19)

Headless Chrome: rectangle (with fill), ellipse, line, highlight and a freehand stroke added on Edit PDF, saved, and
rendered with poppler: green fill, blue outline, yellow see-through highlight and dark-red freehand pixels were all
present. On a page stored turned 90°, a green rectangle's rendered position and size matched the editor's box to three
decimals (fractions of the page). Properties panel showed the right rows for each kind (no fill for a line, flip only for
a line). No requests left the browser. Not checked: touch/pen drawing on real devices; very long strokes.
