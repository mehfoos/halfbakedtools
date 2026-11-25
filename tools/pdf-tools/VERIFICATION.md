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
| Picture page layout: default, margin, custom size, direction, never enlarging, turned pictures, settings checks, building | `core.test.ts` "layout: …", "build: pictures follow …" |
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

Run again on 2026-11-23 in the Playwright 1.65.1 engines (Firefox, and WebKit, the engine Safari uses, with iPhone 13 emulation), against the production build, 23 Nov 2026: every PDF tools page loads with no script errors and no sideways scrolling at desktop
and phone sizes, and Merge joins two generated one-page PDFs into a two-page file containing both pages' text, in both
engines. The other tasks were not driven in these engines, and these are engine builds, not the Safari and Firefox
apps or real phones.

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

### Images to PDF page size and margin (2026-11-19)

Headless Chrome: two pictures converted with the default layout gave pages the size of the picture; with a custom
200 × 300 mm page and 10 mm margin the saved pages were 850.4 × 566.9 points (a wide picture made the page sideways, as
"follow each picture's shape" promises), the picture kept its natural size (never enlarged) and was centred in the
render; switching the unit to inches kept the same size (7.874 × 11.811 in); "always sideways" gave the same sideways page.
No requests left the browser.

### Extract pictures (2026-11-19)

Headless Chrome, two PDFs added together: a two-page scan holding a colour and a grey JPEG, and a PDF holding one PNG-style
picture. Result: a .zip of three files. The two .jpg files were byte-for-byte identical to the picture streams read from the
source PDF by pypdf; the PNG was pixel-identical to pypdf's own decoding of that picture. A text-only PDF gave the message
that no pictures could be extracted, with no file. No requests left the browser. Unit tests cover gray 1-bit, palette,
transparency (soft mask) and the skipped kinds (CMYK, CCITT). Not checked: JPEG 2000 files in other viewers; encrypted
PDFs with a password; very large pictures on a phone.

### Repair PDF (2026-11-19)

Headless Chrome with seven files made from one 4-page PDF: intact, cut off at 80%, index pointing nowhere, junk before the
header, header removed, a block of bytes zeroed, and trailer removed. All saved except none refused; qpdf --check passed
on all but the cut-off copy (qpdf: "ignoring non-stream in an array of streams", a warning, still 4 pages). Messages: the
intact, bad-index and junk files said no problems were detected; the headless file said the marker was put back; the
cut-off file said it ends without an end marker and page 4 could not be read; the zeroed file said it declared 4 pages
but only 1 was found; the trailer-less file said it ends without an end marker. A file with no PDF content at all is
refused with a plain message. Not checked: files with object streams damaged, encrypted damaged files, very large files.

### Compare PDF (2026-11-19)

Headless Chrome with a 3-page and a 4-page PDF (one word changed on page 1, one number on page 2, a new page 4): the
result said 3 of 4 pages differ, struck through "jumps" and "100", underlined "leaps" and "250", marked page 4 as only in
the changed file, warned about the different page counts, drew both pages side by side on request and saved a text report
with the same differences. No requests left the browser. Not checked: scanned PDFs, right-to-left or non-Latin text,
documents of hundreds of pages.

### Text to PDF (2026-11-19)

Headless Chrome with a 160-line text file holding a tab, a 2000-character paragraph, "Café naïve — 日本": saved a 4-page
PDF (poppler: 595.276 × 841.89 pt, Courier, WinAnsi); wrapped lines, the tab (as four spaces) and é, ï and the em dash came
through; the two Japanese characters became "?" and the message said so. Changing the unit converted the typed sizes.
No requests left the browser. Not checked: very large files (megabytes), right-to-left text, files not in UTF-8.

### PDF to Markdown and HTML (2026-11-19)

Headless Chrome with a 2-page PDF made with reportlab (24 pt, 16 pt and 11 pt text, a two-line paragraph, a gap, two bullet
lines, text containing `<angle> & *x*`): both outputs had the 24 pt line as the top heading, 16 pt as the second level,
the paragraph's two lines joined, bullets as a list, page markers, and the special characters escaped (`\<angle\>` in
Markdown, `&lt;angle&gt;` in HTML). No requests left the browser. Not checked: real-world documents with columns, tables or
footnotes (these are expected to come out wrong; the pages say so), Markdown rendered by another program, non-Latin text.

### Fill in PDF forms (2026-11-19)

Headless Chrome with a form made by the library (text box, tick box, drop-down with 3 choices, two radio buttons): the page
listed the four fields; pressing save with nothing changed said so; after typing a name, ticking, choosing "Medium" and
the second radio button the saved file's values read back with pypdf as the name, "/Yes", "Medium" and "/1" (the second
radio button), and qpdf found no errors. With "make permanent" ticked the saved file had no fields left and poppler drew the
name, the ticked box, "Medium" and the chosen radio button. A Japanese name was left unset and the message named the field.
A PDF with no fields got the explanation. No requests left the browser. Not checked: forms from other software (XFA forms,
JavaScript-driven fields, forms with a custom font), encrypted forms, fields spread over many pages.

### OCR PDF (2026-11-19)

Headless Chrome, 300 dpi picture-only PDFs made with Pillow (no text; DejaVu fonts). A 2-page scan: poppler's pdftotext
of the result gave every line exactly ("Invoice number 48213", "Total due: 1,250.00 pounds", ...); word boxes were where
the words are drawn ("Invoice" at x = 48.7 pt, expected 48); the page rendered pixel-identical to the original; qpdf found
no errors. A cropped page kept the same positions. A page stored turned 90° but shown upright came out right (text and
positions as seen). A page shown sideways gave junk words and was named as doubtful (engine confidence 37 against 95-96).
Re-running on an OCR'd file skipped the page and, after the fix above, saves nothing and says why. 4 pages took about
4-5 s. Only this site's files were fetched (worker, engine, language data); nothing was stored in IndexedDB; no requests
left the browser. Not checked: real scanner output (noise, skew), phones (memory), Firefox/Safari, documents of hundreds of
pages, accuracy measured on a labelled set.

### OCR in 40 languages and the glyph-less font (2026-11-19)

The generated font passes fontTools (reads and re-saves) and the OpenType Sanitizer used by Chrome and Firefox (after
giving the blank glyph a header: OTS rejects an empty glyph table); whole-font checksum 0xB1B0AFBA. pdffonts lists it as an
embedded CID TrueType font with Identity-H encoding and a ToUnicode map; qpdf finds no errors.

Headless Chrome drew one sentence twice per page in each of 16 languages (FreeSerif and Noto Sans CJK; shaped by Chrome),
saved as 300 dpi picture-only PDFs; each was OCR'd in the browser with its language chosen. Text extracted by poppler and
by PDF.js was compared with the sentence (similarity of characters, spaces ignored), poppler / PDF.js:
Polish, German, French, Russian, Greek, Arabic, Hebrew, Urdu, Hindi, Bengali, Japanese 1.00 / 1.00; Tamil 0.97 / 1.00;
Welsh 0.97 / 0.97 ("i" read as "1"); Chinese (simplified) 0.90 / 0.90 (馆 read as 饮); Korean 0.90 / 0.90 (한 read as 안, and
words split into syllables); Thai 0.90 / 0.90 (stray marks). The remaining differences are the engine's reading, not
the text layer. Before right-to-left lines were stored in visual order, PDF.js gave Arabic, Hebrew and Urdu reversed
(0.20-0.25); after, 1.00 in both.

Mixed page (Urdu, English, Urdu) read with Urdu + English: both of the first two lines exact in both readers; the third
Urdu line was not found at all. That phrase alone gave no words, and a longer Urdu page came back garbled: the engine's
Urdu model is unreliable on this (Naskh-style) font, and the page now says Urdu results vary. English scans from the
previous check gave the same text and positions as before. Only the chosen languages' files were fetched, all from this
site; nothing was stored in the browser. Not checked: Ukrainian, Bulgarian, Czech, Slovak, Hungarian, Romanian,
Italian, Spanish, Portuguese, Dutch, Punjabi, Telugu, Malayalam, Kannada, Marathi, Nepali, Persian, Turkish, Kurdish,
Chinese (traditional), Vietnamese, Latin and ancient Greek individually (same mechanism, untested text); real scans; viewers
other than poppler and PDF.js (for example Chrome's own PDF viewer, Acrobat).

### Your own font (2026-11-19)

Unit tests: display order for mixed right-to-left and left-to-right text (numbers keep their order); the fsType rules;
subset embedding, ActualText and opacity in the written page; the font embedded only when used; a missing font file and
missing letters reported; HarfBuzz advances equal the font's metrics, and an accent after "u + diaeresis" sits on its own
letter.

Headless Chrome, Text to PDF with FreeSerif (GNU FreeFont) chosen from disk, one line each of Polish, Russian, Arabic,
Arabic with a number and brackets, Hebrew, Hindi, Hindi conjuncts, Bengali, Tamil, Thai, Urdu and a tabbed line; and Noto
Sans CJK (a collection: the page offered its 10 faces) for Chinese, Japanese and Korean. Rendered with poppler: accents
in place (after the switch to HarfBuzz), Arabic and Urdu joined and right-to-left against the right margin, "25" in
order, brackets facing the right way, Indic conjuncts and vowel signs placed, CJK correct. Text extracted: poppler gave
every line exactly as typed, except that in the mixed Arabic line it placed one bracket oddly; PDF.js gave every line
exactly except Hindi, Bengali and Tamil, whose vowel signs come out in display order (as for such PDFs from word
processors). An Arabic watermark (diagonal, faint, with a number) and page numbers rendered correctly, and PDF.js
extracted the watermark exactly. In Edit PDF, Hindi text gave the warning with a built-in font and none after choosing
the font file; the saved page rendered correctly and poppler extracted it exactly. No requests left the browser; the
HarfBuzz WebAssembly file came from this site. Not checked: Firefox and Safari themselves, phones, variable fonts,
colour fonts, vertical text, fonts with unusual tables; Acrobat and Chrome's PDF viewer (expected to use ActualText).

### Malayalam (2026-11-19)

Four Malayalam lines (including the chillu ൻ, conjuncts ന്ത്യ, ക്ക, റ്റ, ന്റ, സ്സ and a number) drawn by Chrome with the official
Noto Sans Malayalam (notofonts.github.io, hinted TTF) as a 300 dpi picture-only page. OCR with Malayalam chosen: before
the encoding fix, poppler 0.94 / PDF.js 0.97 similar (the engine wrote old-style chillu sequences and non-joiners); after,
1.00 in both. Text to PDF with that font: rendering matches Chrome's own rendering of the same lines glyph for glyph;
poppler extracts the text exactly; PDF.js gives vowel signs in display order (as for any Malayalam PDF it reads without
ActualText). Fontsource's WOFF copy of the font, unpacked by this tool, shapes the sentence to the same glyph ids and
widths as the official file.

### Noto Sans (many alphabets) (2026-11-19)

Unit tests: the shipped-file list equals each installed package's unicode.json; only the needed files are chosen; a line
of Malayalam, Hindi and English embeds the Malayalam, Devanagari and Latin fonts and no others; uncovered characters
(Chinese, emoji) are reported. Headless Chrome, Text to PDF with four lines (Malayalam; Malayalam with brackets and a
number; English, Hindi, Arabic, Tamil and Thai; Greek, Russian and Vietnamese): exactly the nine needed font files were
loaded, all from this site; nine fonts embedded (pdffonts), each once; rendering correct; poppler extracted every line
exactly (after mapping clusters to their widest glyph; before, it split "مرحبا"); PDF.js exactly, except Malayalam vowel
signs in display order; the Arabic phrase sits right to left inside the left-to-right line, as browsers place it. Edit
PDF: a Malayalam text box in Noto Sans had no warning, saved, and poppler extracted it exactly; Chinese text in Noto Sans
gave the warning pointing to "Your own font". Not checked: Firefox, Safari, phones, very long texts, every alphabet
individually (Hebrew, Bengali, Gurmukhi, Telugu, Kannada untested in the browser).

### Noto Sans: Chinese, Japanese and Korean (2026-11-19)

Unit tests: each family's numbered files and ranges equal its unicode.json; the style choice; 直 has different outlines in
the Chinese and Japanese files; three lines prepared together and drawn each in its own style leave no character outside
the embedded fonts and no empty font. Headless Chrome, Text to PDF with Chinese, Japanese, Korean and Malayalam/English
lines (automatic style): only the needed files were fetched (the index and 17 font files), all from this site; poppler and
PDF.js extracted all four lines exactly and PDF.js drew them correctly. Before the line-by-line fix, "국" was drawn as a
box in both readers (found by this check). Traditional Chinese chosen: only Noto Sans TC files were used and the line
extracted exactly. Edit PDF with Japanese text: no warning, saved, extracted exactly. Not checked: vertical text, rare
characters beyond the files' coverage, Firefox, Safari, phones.

### Noto Sans: the remaining alphabets (2026-11-19)

Headless Chrome, Text to PDF in Noto Sans with one line each of Hebrew, Bengali, Punjabi (Gurmukhi), Telugu, Kannada,
Thai and Tamil, compared with Chrome's own rendering of the same Fontsource files: the same glyphs and joins in every line.
poppler extracted every line exactly; PDF.js exactly for Hebrew, Punjabi, Telugu, Kannada and Thai, and with vowel signs in
display order for Bengali and Tamil (as for such PDFs from other software). Found and fixed: PDF.js gave the Hebrew words in
reverse order, because each space came from the Latin font and split the line into pieces; spaces now stay in the font of
the text around them (every shipped file has a space glyph, checked), and the Latin file is no longer loaded for them.

### Bold (2026-11-19)

Unit tests: bold Noto text embeds NotoSans-Bold and NotoSansMalayalam-Bold and no regular font; bold in the visitor's font
without a bold file draws in fill-and-outline mode with a 0.6-point outline at 20 points; with a bold file, that file is
embedded and no outline is drawn; regular text has no outline. Headless Chrome, Edit PDF: bold Malayalam and English in Noto
(NotoSansMalayalam-Bold, NotoSans-Bold embedded), FreeSerif bold simulated (FreeSerif embedded, visibly heavier), and
FreeSerif with FreeSerifBold added as its bold version (FreeSerifBold embedded); all rendered by poppler as expected and
extracted exactly.

### Urdu in Nastaliq, and copied text in four readers (2026-11-19)

Unit tests: Urdu picks Nastaliq and Arabic and Persian pick Naskh, and the choice can be fixed; Nastaliq's height is over
1.5 times the text size; a page with Urdu and Arabic embeds both fonts; in "بيت ثابت", "شکریہ اور خدا حافظ" and
"किताब और पुस्तक" the character map of every drawn glyph, put together, gives back exactly the letters typed (ب/ت/ث/ي
and ح/خ share base glyphs), the dot glyphs give U+2060, and every line, right-to-left included, carries its text as
ActualText. A stand-in shaper drawing "ABC" with the glyph of "A" three times, in a CFF font (InterDisplay-Black.otf) and
a TrueType font (Liberation Sans): both PDFs pass `qpdf --check`, show "AAA" and copy as "ABC" in poppler and PDFium.

Headless Chrome, Text to PDF in Noto Sans: three Urdu lines (پاکستان ایک خوبصورت ملک ہے / میں اردو پڑھتا ہوں /
شکریہ اور خدا حافظ) render with the same glyphs and joins as Chrome's own rendering of the Fontsource file, and the lines
no longer overlap (they did when line spacing came from the Latin font). Earlier test files (mixed alphabets, Chinese,
Japanese, Korean, Malayalam) rendered pixel for pixel the same glyphs after glyphs were written as runs; only the line
spacing changed.

Copied text, 15 lines in 12 scripts (Hebrew twice, Bengali, Punjabi, Telugu, Kannada, Thai, Tamil, Arabic twice, Hindi,
Malayalam, Urdu three times), compared line by line ignoring spaces and invisible format characters:

| Reader | Exact lines | What goes wrong |
|---|---|---|
| PDFium 153 (pypdfium2; the engine of Chrome and Edge) | 15/15 | — |
| PDF.js 6.5 (Firefox's reader; pdfjs-dist) | 10/15 | ignores ActualText: Bengali and Tamil vowel signs in display order; Urdu Nastaliq out of order |
| poppler 24.02 (pdftotext) | 6/15 | reverses tagged right-to-left lines letter by letter; on a mostly right-to-left page also moved a Hindi and a Malayalam vowel sign to the line start (it did this before these changes too) |
| MuPDF 1.28 (PyMuPDF) | 6/15 | reverses tagged right-to-left lines; repeats the end of some Indian-script lines (its ActualText matching subtracts a byte count from a character count; it did this before these changes too) |

Before these changes, on 6 of those lines (Arabic twice, Hebrew, Hindi, Urdu twice), PDFium gave 1, PDF.js 1, MuPDF 1
and poppler 4, with control characters in all but poppler. For comparison, the same Arabic and Urdu lines printed to PDF
by Chrome from the same fonts: poppler split words with spaces, PDFium gave Arabic in reverse order and broke the Urdu
into fragments, and PDF.js gave mostly null characters. No reader showed control characters after these changes.
Not tested: Adobe Acrobat, Apple Preview.

### Filling forms in other alphabets (2026-11-19)

Unit tests (form made by the library: single-line, right-aligned, multi-line, turned 90°, editable drop-down, multi-choice
list box, plain English field): Malayalam, Hebrew, Arabic with Hindi, Hindi in the turned field, a Malayalam drop-down
value and Malayalam and Urdu list choices are drawn with Noto Sans (6 fields), the English field by the library; values
read back as typed; the form is marked NeedAppearances false; the drawn fields carry ActualText; the frame (rotation,
background, border, clip) is identical, operator for operator, to the library's own appearance of the same field; chosen
list options have the library's highlight; with the visitor's font (Liberation Sans) a Malayalam field is refused and
named with the missing letter; without fonts given the old refusal remains; flattening works. Automatic size, Arabic over
Hindi in a multi-line field: the Hindi line is spaced by the Devanagari font and its descenders stay inside the box (the
check failed, at 3.2 points above the box bottom at 11 points, with the fitting step turned off).

Rendered with poppler and PDFium (pypdfium2, with form drawing) and after flattening: the same in all three, nothing
clipped once realistic sizes were used. (A form saved by the library itself fixes "automatic" sizes to whatever fitted the
empty field, 20 to 82 points here; forms from other software keep automatic size, as the ReportLab form below does.)
Copied text from the flattened copy: PDFium exact in every field; poppler reverses the right-to-left lines, as recorded
above.

Headless Chrome, Fill in PDF forms page, with a form made by ReportLab 5.0 (not by this site's library: automatic-size name,
11-point multi-line address, editable drop-down, list, underlined date field, tick box): Malayalam name, a three-line
address in Arabic, Hindi and English, a Hindi date, "Pakistan", "Urdu" and the tick box; saved filled and made permanent:
6 fields changed, values read back with pypdf as typed, qpdf finds no errors, poppler, PDFium and the flattened copy look
the same and match the form's other fields. Found and fixed on the way: (1) heights came from every font loaded for the
document, so Nastaliq loaded for one field made the others small and low; (2) the three-line address lost its last line,
because the library spaces lines by one font height and Noto Sans Arabic asks for about 2.1 em; (3) the last line's
descenders were clipped at an automatic size. "Your own font" with no file chosen gives a clear message; with a
Latin-only font the message names each field and the letters it lacks. No requests left the browser.
Known difference from the blank form: the underlined date field gets a full box once filled, in English too (the library
ignores border styles).

### Redact PDF (2026-11-20)

Unit tests: a three-part test PDF (name in the page text, the document title, subject and keywords, a comment on
another page and an attachment) is found by the leftover scan in four or more places before redaction; after it, with
the other pages stripped, nothing is found, the other page's own text is still there, the rebuilt page holds one
picture and no fonts, and the title is gone. Without stripping, the comment is kept and reported (directly and inside
the compressed object stream that holds it). A page with areas can't be saved by any other task. Recognised words
become an invisible layer on the rebuilt page. Finding text: a phrase split across two pieces is found once, with
letter case and spacing ignored; a boundary inside a piece is widened by 0.35 of the size, one at the edge of a piece is
exact; "whole words only" skips "Janet"; a right-to-left piece is covered whole; text running upwards gives a tall,
narrow area. Areas on one line are joined; settings files keep only well-formed, unturned areas. The looser search for
warnings finds jane.doe, JANE_DOE and Jane-Doe but not "Janet Doe"; a piece counts as covered when its middle is under
an area. The leftover scan first missed page text written as hex strings by the PDF library; it now decodes the strings
page contents show.

Headless Chrome, Redact PDF page, with a three-page ReportLab test file (a standard font and an embedded TrueType font,
a link, a coloured box, the name twice on page 1 and in capitals on page 3, a phone number):
- "jane doe" and the phone number found and marked (4 places on 2 pages); an area drawn by dragging over "Dr Smith".
- Saved file: qpdf finds no errors; pages 1 and 3 are single 200 dpi pictures (JPEG was smaller) with no fonts and no
  links; page 2 kept its text; the file has no title; the name and number are absent from the text in poppler,
  PDFium, PDF.js and MuPDF, and from the uncompressed file. The areas render solid black where the editor showed them.
  24 KB became 85 KB.
- A page stored turned 90°: rebuilt the same way up and size as before, with its area in place.
- Comments kept on another page mentioning the name: before handing the file over, the page reported where the name
  remained and asked; "Save it anyway" saved it and the message repeated why.
- Text recognition on: first read at the picture's 200 dpi with black areas, the engine read the areas as "||" and
  garbled the next word ("born" came back as "loon", and as "Joo" at 300 dpi); reading a separate 300 dpi drawing with
  the areas painted white gave the visible text back cleanly ("Patient:", "born 1 February 1980.").
- One found area deleted before saving: the page said the name on page 1 was not under an area and asked; "Don't save"
  saved nothing. The e-mail address jane.doe@example.com, not matched by "jane doe", was pointed out as a close variant.
- Deleting an area with the Delete key after clicking it did nothing (the editor lost focus when redrawing its
  handles); fixed for Edit PDF as well, and checked there.
- No requests left the browser; no page errors.

Layers: a PDF with text in a hidden layer showed that text after being saved by the builder (poppler drew 236 dark
pixels against 77 for the original). With the layer settings copied, poppler draws 77 on the saved page, and on both
copies of a page used twice; a unit test checks that the hidden list names the layer each page uses. (Text in a hidden
layer is still in the file, as in the original, and PDFium's text extraction gives it.)

Not checked: Adobe Acrobat or Apple Preview; very large documents (time and memory); encrypted originals; pages with
annotations whose appearance carries the text (they are dropped with the page when it has areas).

### PDF to PDF/A (2026-11-20)

`web/pdfaconvert.ts` with `web/pdfascan.ts` (content streams), `web/pdfafonts.ts` (font programs) and
`web/pdfachecks.ts` (whole-file checks). Every output below was checked with veraPDF 1.30.4 (`-f 2b`); veraPDF and the
test files stay on the test machine and are not part of the repository.

- Our 29 test files (pdflatex, xelatex, LibreOffice, Chrome, cairo, ReportLab, PyMuPDF, wkhtmltopdf, img2pdf, files
  saved by this site's own tasks, encrypted files): 28 converted and all 28 pass. The CMYK picture without a CMYK
  profile is refused. Word positions (pdfminer) are unchanged in every file; poppler renders differ only where a
  standard font without embedding was replaced (glyph shapes, same widths) and where a note icon was drawn.
- veraPDF's own PDF/A-2b test suite (986 files, CC BY 4.0; half are built to fail one rule each): 875 converted, all 875
  pass. The first run passed 865 of 941 and failed 76; each failing rule was then either fixed or detected and refused
  (fonts' glyphs, widths and .notdef; CMaps and character collections; TrueType encodings; spot colours; JPEG 2000
  headers; size limits; badly written hex strings; operators and rendering intents ISO 32000-1 doesn't define;
  resources a drawing names but doesn't have; metadata on single objects; external streams; halftone transfer
  functions; push buttons' appearance; actions not on PDF/A's list; signatures). Files built to pass that are refused:
  4 (a signed file, whose signature conversion would break; a font built on a predefined CMap this tool can't read;
  two files with overprint mode 1, refused whenever ICC CMYK colour is present rather than checked operator by
  operator). Two pass files had first failed after conversion, because their objects' metadata relied on extension
  schemas in the replaced document metadata; object metadata is now removed and reported.
- 200 PDFs found on the test machine (TeX Live documentation and images, matplotlib, LibreOffice; pdfTeX, Ghostscript
  8 to 9.56, cairo, Skia, Ipe and others): 184 converted, all 184 pass. Of the 16 refused, 15 use plain CMYK (four of
  them also draw .notdef glyphs, which veraPDF confirms on the originals) and one has a damaged content stream
  (qpdf reports a decoding error) that reads as operators no reader defines.
- Unit tests: the lexer's hex-string, integer and inline-image handling; unknown operators and intents and missing
  resources reported; Type 2 charstring widths (nominal and default width); CMap codespace splitting and CID ranges;
  glyph names; JPEG 2000 header checks; an odd hex string completed; a long name and two differing definitions of one
  spot colour reported; Helvetica without embedding replaced by Arimo with scripts removed; a signed file refused;
  page-tree resources written on the page.
- Found while testing: fontkit reads CFF format 1 encodings with the wrong field sizes (CMR10's codes then reached no
  glyph), so those are read by this site's code; a font descriptor pointing at a missing font file was taken as
  embedded; a page without Contents was reported as unreadable.

Not checked: Adobe Acrobat's preflight or other validators; files from Microsoft Office, Adobe InDesign or scanners
(none were on the test machine); right-to-left and CJK files beyond the site's own; very large files.

The page itself (headless Chrome, preview build):
- A ReportLab form using Helvetica without embedding, with a CMYK picture file, "Don't convert it" chosen: one PDF saved
  (Helvetica replaced by Arimo, fields' extra looks removed); the CMYK file listed as not converted with the reason and
  how to convert it anyway. veraPDF: pass.
- The CMYK file with "Rebuild its pages as pictures": saved, with the reason listed; veraPDF: pass. pdflatex and
  LibreOffice files together: a .zip of two, each with its list of changes; both pass.
- A ReportLab page of black CMYK text, rebuilt as pictures with text recognition (English): the three lines come back
  exactly from pdftotext; veraPDF: pass.
- Rebuilding outside the browser (`picturesToPdfA` with JPEG, RGB PNG, RGBA PNG, grey PNG and a line of recognised
  text with ö and €): all four pass veraPDF, and the text is extracted.
- Fonts and the text-recognition engine came from this site; no requests to other sites; no page errors.

### PDF to Word, PowerPoint and Excel (2026-11-20)

`web/office.ts`. Test files: ReportLab (a ruled table with right-aligned numbers and a total, a landscape table, a
two-page report with headings and a bullet list), a LibreOffice Calc sheet exported to PDF, pdflatex, xelatex,
LibreOffice Writer, wkhtmltopdf, Chrome, and this site's own Latin, Cyrillic, Arabic, Hebrew, Devanagari and CJK texts.

- Every XML part of all 33 files (11 PDFs × 3 formats) and of the files saved from the page validates against the
  ECMA-376 5th edition Part 4 (transitional) XML schemas with lxml; the packaging parts ([Content_Types].xml, the
  relationship parts, core properties) were not schema-checked. Excel's own files put `xml:space` on cell text,
  which the schema doesn't allow; this site leaves it out.
- All 36 files open in python-docx, openpyxl and python-pptx and convert to PDF in LibreOffice 24.2 (headless).
- Excel: the ReportLab table comes back exactly (4 columns, numbers as numbers, "1,234.50" as text), the landscape
  table too (6 columns, "-2%" as text), the LibreOffice sheet with five columns and its numbers, except its header,
  where "Transport Total" is one piece of text in the PDF across two columns and lands in one cell. Arabic lines come back as
  the PDF stores them, and Arabic words drawn as separate pieces are put back in reading order (unit test). Prose pages come back as one cell per line.
- Word: headings, paragraphs and the three bullet items are found in the ReportLab report (the bullets were first
  taken for headings, because the bullet glyph is drawn larger than the text; lines now take their size from their
  words, which also fixes PDF to Markdown and HTML); the second page starts on a new page; landscape PDFs give
  landscape pages; a Hebrew paragraph is marked right to left (unit test). In the site's mixed-script text, lines in
  different scripts close together are joined into one paragraph (as in PDF to Markdown), which starts in Latin and so
  runs left to right.
- PowerPoint: one slide per page, the slide the first page's size (A4 portrait: 7,560,310 × 10,692,000 EMU), a
  landscape page fitted inside it; pictures as JPEG at the chosen detail and quality.
- In the page (headless Chrome): all three save their file with the right name; the picture options show only for
  PowerPoint; a scanned PDF gives "No text was found ... run OCR PDF first"; no requests to other sites; no errors.
- Unit tests: XML text cleaning, plain numbers, right-to-left detection, columns from aligned gaps with a heading
  over right-aligned numbers, an empty row for a big gap, right-to-left words put back in order, the parts each file
  needs, PowerPoint's 56-inch slide limit, and a larger bullet not making a heading.

Not checked: Microsoft Word, Excel or PowerPoint themselves (not available here); Google Docs, Sheets or Slides;
tables with merged cells or wrapped text; many-column financial statements.

### Compress PDF to a size, detail as drawn, lossless tidying (2026-11-22)

- A ReportLab test file of six 3000 × 2000 photos drawn 6.25 inches wide plus a 2000 × 2000 logo drawn 1 inch wide
  (8.13 MB; ReportLab stores its JPEGs wrapped in ASCII85, so the earlier version left every picture alone): the size
  offered first was 4 MB; results 3.95 MB (6 tries, 397 dpi, 92%), 787 kB for an 800 kB limit (5 tries), 19.6 kB for
  20 kB (3 tries, the strongest setting). A 5 kB limit can't be reached: the 19.6 kB result is offered with the warning.
  The downloaded files are exactly those sizes; the text is unchanged (pdftotext), qpdf finds no errors, and the logo
  came out at 258 × 258 pixels (258 dpi as drawn), where the page estimate would have kept 2000 × 2000.
- Eight of our test files at once (one limit for each: 46 kB, half the largest): three reach it, five can't (no
  shrinkable pictures or text-heavy), each said so; every file keeps its text and page count; a file tidied without
  loss renders pixel for pixel the same as its original (poppler, 60 dpi).
- A one-page text file is tidied only ("no loss of quality").
- Unit tests: the settings ladder, the size offered first, detail as drawn (including a squashed picture), the search
  keeping the mildest result within 5% under the limit, stopping after one try when already small enough and after two
  when the limit can't be reached; ASCII85-wrapped JPEGs and pixels accepted, predictors in chains refused; thumbnails
  removed and an uncompressed stream compressed and read back unchanged; size targets kept in the settings file.
- The saving shown is now rounded down (an 8.13 MB file reduced to 19.6 kB shows 99%, not 100%).

Not checked: very large scanned files (time per try grows with the pictures; each try redoes them all); files whose
pictures are mostly CMYK, JPEG 2000 or JBIG2, which are still left as they are.

### Compress PDF: other picture types, three at a time, wider search (2026-11-22)

- Test files made with PIL and img2pdf: a 2400 × 1600 photo as CMYK JPEG (1.86 MB), as JPEG 2000 (1.44 MB) and as a
  256-colour palette PNG (850 kB); previously all three were left alone. With the size offered first, each now
  reaches its limit (741 kB of 930 kB; 656 kB of 720 kB; 413 kB of 420 kB), stored as RGB JPEG. Compared with
  poppler's rendering of the originals (30 dpi, mean difference per channel, 0 to 255): JPEG 2000 1.4/0.8/1.7, palette
  1.9/1.1/2.2, CMYK 8.3/9.7/7.7 (PDF.js uses a CMYK profile, poppler a plain formula; neither is "the" answer for
  colours without a profile). The result says which pictures changed colour system.
- A 30-page grey scan (28.7 MB, 300 dpi JPEGs): with three pictures at a time, 6 tries took 20 s instead of 28 s in
  headless Chrome on the test machine; with the wider search the run now takes 9 tries and 32 s and lands at 13.4 MB
  for a 14 MB limit. Phones will be slower.
- The photo test file: 3.64 MB for 4 MB (7 tries), 755 kB for 800 kB, 19.6 kB for 20 kB; the search stops when the
  settings either side differ by less than 1/50, where JPEG's whole-number quality steps make sizes jump.
- Unit tests: CMYK, JPEG 2000, palette and remapped pictures go to the reader only when one is given; masks, 1-bit,
  JBIG2, CCITT, 3-bit and encrypted (Crypt) pictures never do; plain colour still goes direct.

### Compress PDF: repeated parts stored once; decoded pictures kept between tries (2026-11-22)

- A file made by joining the photo test file to itself with pikepdf (16.3 MB, every picture and font stored twice):
  13 repeated streams stored once; the result keeps all 12 pages and the same text (pdftotext), qpdf finds no errors,
  and the 12 pages use 7 picture objects, as in the original. For an 8 MB limit: 6.93 MB in 3 tries.
- Keeping decoded pictures between tries, measured in headless Chrome: the 30-page grey scan took 30 s with every
  picture kept (400 million pixels allowed) against 32 s without, so pictures the browser decodes itself are not
  kept; the JPEG 2000 file (drawn by PDF.js) went from 5 s to 2 s, so those are kept, within the memory budget.
- Our eight largest test files compressed together again: same text in every output.
- Unit test: two identical pictures become one object, a third with another colour space stays separate, and the
  dropped copy is pruned.

### Compress PDF to a size: searching on a sample (2026-11-22)

- Measured first: in a try on the 30-page scan, reading the file took 15 to 30 ms and saving 2 to 65 ms; re-encoding
  the pictures took 1.2 to 3.9 s. So tries were made cheaper by estimating from a sample instead.
- Headless Chrome, the same machine as before:

  | File | Limit | Before (every try in full) | Now |
  |---|---|---|---|
  | 30-page grey scan, 28.7 MB | 14 MB (offered first) | 32 s, 13.4 MB | 12 s, 13.1 MB (2 full tries, 7 estimates) |
  | same | 3 MB | not measured | 16 s, 2.86 MB (4 full tries) |
  | scan + photos + CMYK + JPEG 2000 + palette, 40.9 MB | 20 MB | not measured | 29 s, 19.6 MB (5 full tries) |
  | same | 5 MB | not measured | 16 s, 4.67 MB |

  The first estimate for the mixed file was 20% low (19.4 MB predicted, 24.0 MB made); the correction found 19.6 MB.
  An earlier version that didn't correct the estimate landed at 4.06 MB for the 20 MB limit, which is why it does.
- Unit test: an estimate 20% low still lands within 7% under the limit in at most four full tries; an unreachable
  limit makes the strongest setting and reports that nothing fits.
- Files with eight pictures or fewer are searched in full, as before.

### Edit PDF and Fill in PDF forms review (2026-11-25)

Headless Chrome (system Chrome through Playwright), as a computer (1280 × 900) and as a phone (390 × 844, touch,
scale 2), on generated files: three pages with one turned 90°, a scanned form (a picture only), a photo, a two-field
form and an eight-field, two-page form (text, multi-line, radio, drop-down, list, read-only, tick box; tooltips on
three). Touch was sent through Chrome's DevTools protocol.

Found and fixed:

- Phone: the Fill in PDF forms page was 588 px wide on a 390 px screen (a long drop-down); now 390. Edit PDF's page
  editor also widened the page once its tools were put in one row; fixed by letting the grid column shrink.
- Phone: a finger dragged on the page in Edit PDF didn't scroll it (the whole page took touches). Now it scrolls
  (scrollY 0 → 415 for a 300 px drag); dragging an addition with a finger moves it (40, 60 px as sent) and Undo puts
  it back; drawing with a finger draws (the page didn't move during the stroke).
- ＋ Text didn't put the cursor in the Text box (the box was shown only after the page was redrawn); typing a space
  then pressed ＋ Text again. Now the Text box has the cursor.
- Text couldn't be resized by dragging; now its corner square scales its size (15 → 31 points for a 40 px drag),
  and Undo returns it to the size before the drag.
- New additions were all placed at the same top-left spot; now each lands where the page is on screen, clear of the
  others (checked at 200% zoom: the new text was fully on screen).
- A filled form saved from Edit PDF was no longer fillable (no form fields left; pypdf read none). Now its fields
  and values are kept (pypdf: name "Ada", agree "/Yes") when the whole file is saved.
- Page tiles cut off "1 addition (not shown in this small preview)"; it now wraps.
- Fill in PDF forms: fields are now in reading order with their tooltips, and the form is drawn beside them;
  clicking a field's box on the drawing puts the cursor in its control, and choosing a field on page 2 turns the
  drawing to page 2 with that field outlined. Saved file: 4 fields changed as set.

Checked unchanged: saved pages match the editor's drawing (text turned 15°, bold, picture, highlight, ellipse, line,
tick, cross, date, freehand line), including on the page turned 90°; pictures keep their proportions when resized;
the arrow keys nudge and Delete removes; Sign PDF saves a drawn signature on a phone. `npm test`: 272 pass.

Not checked: real phones (iOS Safari and Android Chrome); pinch-zoom; screen readers.

### Edit PDF: text boxes and stretching pictures (2026-11-25)

Same set-up (headless Chrome, computer and phone sizes). A 61-letter sentence on page 1: it wrapped at the page
edge as typed (box 322 px wide on the computer); dragging the corner square 60% to the left made the box 129 px wide
and the text rewrapped to five lines with its size unchanged (15 points); dragging it shorter left the height at what
the text needs (no warning); dragging it 60 px taller kept that height, and typing four times the text then showed
the "runs below its box" warning, which "Fit the box to the text" cleared. A picture with "Keep proportions" unticked
stretched from 2.5 : 1 to 1.52 : 1 and returned to 2.5 : 1 when ticked again. The saved page matched the editor's
drawing line for line. On the phone the page now scrolls so the chosen addition's corner square stays above the
settings sheet (before, it could end up under the sheet, out of reach). Unit tests: wrapping, a box that is
overrun, words longer than the box, and saved settings with a box or a stretched picture (274 pass).

### Edit PDF: lining text up (2026-11-25)

Phone size, headless Chrome: three wrapped texts set to left, centre and right; the saved page (rendered with
pdftoppm) showed each as set, the wrapped second lines centred and right-aligned under the first. Unit test:
line positions for each setting with a box, without one, and turned 90°; saved settings keep centre and right and
refuse anything else (275 pass).

