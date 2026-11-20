# PDF tools: roadmap and handover notes

For whoever continues this work, human or AI. Read [`AGENTS.md`](../../AGENTS.md), [`docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md),
then this tool's [`README.md`](README.md) and [`DECISIONS.md`](DECISIONS.md) (which records the owner's full
requirements) first.

**The rule that outranks everything: no file content leaves the browser.** No server step, no CDN, no third-party
request. `web/privacy.test.ts` and the security policy in `web/csp.ts` enforce it; never weaken either to make a
feature work. Any new worker must be started from a blob, or the policy won't bind it (see `README.md`). If a feature can't be done locally, don't offer it, and say so.

## Interface direction (owner, 2026-11-16)

The owner wants the interface to **emulate ilovepdf.com's way of working, in this site's own theme** (Averia
fonts, navy on beige; do not copy their branding, icons or colours). That means task-first: a grid of named
tasks (Merge PDF, Split PDF, Rotate, PDF to JPG, JPG to PDF, Word to PDF, ...), each opening a focused page with
one large "select files" button, then previews with the task's few options beside them and one clear action
button. The current single workspace page can stay as the "organise" task and the engine behind all of them
(`session.ts`, `build.ts`, `render.ts` need no change). **Done 2026-11-16**: see `web/tasks.ts` (the task list),
`components/Task.astro` (the shared page) and `pages/index.astro` (the grid). To add a task: add an entry to
`TASKS`, a one-line page in `pages/`, and a `"nav": false` entry in `tool.json`. When a "Not built yet" task is
built, move it from `NOT_BUILT` to `TASKS` (done for Compress PDF and Edit PDF). The owner stressed again that, unlike that
site, **everything must be processed locally and nothing may go to a server or cloud**.

## Matching ilovepdf.com, in small chunks (owner, 2026-11-16)

The owner wants the interface **and the range of tools** to follow ilovepdf.com, including anything they offer
that this tool lacks, **built in bite-sized chunks, never all at once**, so work can stop and resume at any point.
Rules for every chunk: one tool (or two tiny related ones) per chunk; its own branch; unit tests; an end-to-end
browser run with outputs checked by separate software; methods page, `VERIFICATION.md`, `DECISIONS.md` and this
list updated; then merged and published before the next chunk starts. Local-only is non-negotiable: if a tool
can't be done on the visitor's device, it goes in `NOT_POSSIBLE_LOCALLY` in `web/tasks.ts`, not in the queue.

Their tool list was read from https://www.ilovepdf.com/ on 2026-11-16. Status of each:

| Their tool | Here | Notes |
|---|---|---|
| Merge, Split, Remove pages, Extract pages, Organize | Done | |
| Compress PDF | Done | Six levels plus custom |
| Rotate PDF | Done | |
| JPG to PDF | Done as "Images to PDF" | Theirs also offers orientation and margins: chunk 6 |
| PDF to JPG | Done | Theirs can also pull out the pictures stored in a PDF: chunk 6 |
| Edit PDF | Partly | Text, pictures, rectangles, ellipses, lines, highlights and freehand drawing done (chunk 5, 2026-11-19). Still missing: changing or removing what is already on a page |
| Unlock PDF, Protect PDF | **Done 2026-11-16** (chunk 1) | `protect()` in `web/build.ts`; both are per-file tasks. Possible follow-up: offer protection as a last step in the all-in-one workspace |
| Page numbers | **Done 2026-11-17** (chunk 2a) | `web/stamps.ts`; live preview in `ui.ts` (`drawPreview`) |
| Watermark | **Done 2026-11-17** (chunk 2b), text only | `watermarkMarks` in `web/stamps.ts`. Follow-ups: a picture (logo) watermark, as a fingerprinted source like placed pictures; a choice of pages; drawing behind the page's content |
| Crop PDF | **Done 2026-11-19** (chunk 3) | `web/crop.ts`, cropper in `ui.ts`. Sets the crop box; hidden, not removed (stated on the page). Same margins on every chosen page. Follow-ups: margins as a percentage of each page; auto-detect white borders; crop in the all-in-one workspace; keyboard handles on the box (the number boxes work without a mouse) |
| Sign PDF | **Done 2026-11-19** (chunk 4) | Draw a signature (canvas), place it as a picture mark. Not a cryptographic signature: say so. "Request signatures from others" is not possible locally |
| Edit PDF: shapes, freehand | **Done 2026-11-19** (chunk 5) | `ShapeMark`, `InkMark`, `shapePath`, `placeBox` in `web/marks.ts`; draw mode in `web/editor.ts`. Follow-ups: arrows, text-aware highlight, an eraser for strokes, bring-to-front/back |
| Images to PDF page size, direction and margin | **Done 2026-11-19** (chunk 6a) | `web/layout.ts`; size is "same as the picture" or a size the visitor types. **Named sizes (A4, Letter) are NOT offered yet: they need an archived source (see "Sources to archive"); then add them as presets in `Task.astro` (#imSize) and `web/layout.ts`** |
| Extract stored pictures from a PDF | **Done (chunk 6b)** | Raw JPEGs can be copied out unchanged; other picture types need decoding; say which could not be extracted |
| Repair PDF | **Done 2026-11-19** (chunk 7; `web/repair.ts`) | Reads leniently, rewrites with a fresh index, names pages whose content is missing and notes a missing end marker. Follow-ups: rebuild from object scanning when too little structure is left; drop or blank unreadable pages by choice |
| Compare PDF | **Done 2026-11-19** (chunk 8; `web/diff.ts`) | Text difference by word, page by position, pages side by side on demand, report as .txt. Follow-ups: match pages by content; picture (pixel) comparison |
| Text file to PDF | **Done 2026-11-19** (chunk 9a; `web/textpdf.ts`, `components/TextTask.astro`) | Own page (no PDF pages to arrange); built-in fonts only, so characters outside Western European ones become "?" and are counted. Follow-ups: embedded font for other scripts (needs a licensed, archived font); Markdown rendering |
| PDF to Markdown, PDF to HTML | **Done 2026-11-19** (chunk 9b; `web/structure.ts`) | Headings by size, paragraphs by line gaps, bullet lists; text is read in the file's own order. Not recovered: tables, columns, pictures, links, bold/italic. Follow-ups: tables, columns, bold/italic from font names, links, page images |
| HTML file to PDF | Not planned yet | Needs a layout engine in the browser; converting only its text would misrepresent it. Revisit with a rendering approach that can be verified | Rough by nature; label as such. HTML to PDF from a web address is not possible locally |
| PDF Forms (fill in) | **Done 2026-11-19** (chunk 10; `web/forms.ts`) | Fills existing fillable fields (text, tick boxes, radio, drop-down, list), optionally flattens. Other alphabets drawn with Noto Sans or the visitor's font (2026-11-19). Follow-ups: a live preview of the page with its fields; creating forms; filling several files; signature fields; border styles other than a full box (underline, dashed, bevelled), which the library also ignores; comb fields in other alphabets (drawn as ordinary text) |
| OCR PDF | **Done 2026-11-19** (chunk 11; `web/ocr.ts`, `web/tess.ts`, `web/glyphless.ts`, `web/ocrlangs.ts`) | Tesseract (tesseract.js 7, Apache-2.0) served from `vendor/tesseract/`; 40 languages (each 0.4–3 MB, fetched only when chosen; about 67 MB on the site in all), up to two at once; our own glyph-less font for the invisible text, so every script works; right-to-left lines stored in visual order; no-space scripts joined; no browser storage. See `THIRD-PARTY.md`. Follow-ups: Sorani Kurdish (no LSTM model exists); vertical Chinese/Japanese; automatic page-orientation detection; Korean words are split where the engine splits them |
| Redact PDF | **Done 2026-11-20** | Pages with areas are rebuilt as pictures; find words; check after saving. Follow-ups below |
| PDF to PDF/A | Chunk 13 | Demanding standard; may only be partly achievable. Don't claim conformance without a validator |
| Word/PowerPoint/Excel to PDF | On hold (owner) | Branch `office-to-pdf` |
| PDF to Word/PowerPoint/Excel | Chunk 14 | Rough by nature |
| Workflows | Later | The all-in-one workspace plus the settings file cover part of this |
| AI Summarizer, Translate PDF, Scan to PDF (phone to browser) | Not possible locally | Listed on the home page with the reason |

Interface: the home page now has their category buttons (All, Organise, Optimise, Convert to PDF, Convert from
PDF, Edit, Security) over the grid, and unbuilt tools are shown greyed in their category.

## Interface pass 1: page lists (owner, 2026-11-19) — done

The owner found it poor that every tool listed every page (hundreds, for a long file), even tools such as Compress
that act on whole files, with the buttons far below. Done: (1) tasks that act on whole files (those with no
page-level part: Split, Compress, Unlock, Protect, Page numbers, Watermark, PDF to text; see `showsPages` in
`web/tasks.ts`) show a plain file list (name, pages, size) instead of page thumbnails; (2) tasks that do need pages
show them **one screenful at a time** (`web/paging.ts`: whole rows that fit the screen, Previous/Next and a short
row of screen numbers, "Pages per screen" override), with "Select all (N)" and "Select none" acting on the whole
document, not only the screen in view; (3) selection starts as "all" where it only says which pages to use (Rotate,
Resize, PDF to JPG, PDF to image/PNG/TIFF/BMP/WebP; the two PDF-to-picture tasks now save the ticked pages), and
as "none" where ticking means act on or keep these (Remove, Extract, Merge, Organise), because selecting all by
default there would make Remove delete everything; flip with `selectAll` in `web/tasks.ts`; (4) the main button
stays in view (sticky at the bottom of the options panel on wide screens; pinned to the screen bottom on phones).
Follow-ups: dragging a page to another screen isn't possible (use Move earlier/later or Move to position, which
follow the pages); check on real phones, Firefox and Safari; keyboard-only paging check.

## Where things stand

| Phase | Scope | Status |
|---|---|---|
| 1 | Skeleton, no-upload enforcement, merge, reorder, duplicate, remove, rotate, resize page with contents, split, extract, PDF → images (PNG, JPEG, WebP, TIFF, BMP) and text, images → PDF, settings file | **Done 2026-11-16** (alpha) |
| 2 | Compression with options and size preview; resize images inside scanned PDFs independently of page size; named paper sizes | **Compression done 2026-11-16** (`web/compress-core.ts`, `web/compress.ts`); it also covers shrinking scan pictures without changing page size. Named paper sizes still wait for a source |
| 3 | Edit page content: add text and images, move/resize/rotate them, remove or redact content | **Adding done 2026-11-16** (`web/marks.ts`, `web/editor.ts`; text and pictures, move, resize pictures, rotate, font/size/colour/bold). Removing or changing existing content not started |
| 4 | Text and HTML ↔ PDF; Word, PowerPoint, Excel (and OpenDocument) ↔ PDF; PDF → SVG | Office → PDF **on hold by the owner (2026-11-16)**, work kept on branch `office-to-pdf`; rest not started |
| 5 | Task-first interface in the style of ilovepdf.com, in this site's theme | **Done 2026-11-16** |

Owner requirements not yet met are exactly phases 2 to 4. Nothing in phase 1 is known to be broken; the unchecked
items are listed at the bottom of [`VERIFICATION.md`](VERIFICATION.md).

## Loose ends from phase 1 (small; do these first)

- [ ] Check in Firefox, Safari and on a phone; check drag-and-drop; try large and awkward real-world PDFs
      (hundreds of pages, scans, forms, CJK text). Record results in `VERIFICATION.md`.
- [ ] **Sources to archive.** The owner supplied the PDF standard (PDF 32000-1:2008) and the unit was checked
      against it (see `VERIFICATION.md`), but the file is not committed: its copyright notice says permission to
      reproduce must be arranged with ISO, and the owner decided not to commit it (2026-11-16). Still needed: a
      source for ISO 216 (A-series) and US Letter/Legal dimensions (downloads are blocked from the build
      environment; ask the owner to upload). Then add `references.json`,
      cite them on the methods page, tick them off in `VERIFICATION.md`, and offer named paper sizes.
- [ ] **OCR licence evidence to archive (owner).** The tessdata_best README and LICENSE
      (github.com/tesseract-ocr/tessdata_best) and the naptha/tessdata README (which says `4.0.0_best_int` is the
      integerised tessdata_best). Read through mirrors on 2026-11-19; see `THIRD-PARTY.md`.
- [x] **Your own font** (owner's option 1, 2026-11-19): a font file from the visitor's device for Edit PDF text,
      Text to PDF, page numbers and watermarks; HarfBuzz shaping and bidi (owner's option 3, needed: fontkit misplaced
      accents). Bold added 2026-11-19. Form filling added 2026-11-19. Not yet: a font kept between visits.
- [x] **Shipped fonts (owner's option 2): "Noto Sans (many alphabets)"** (2026-11-19): Latin, Greek, Cyrillic, Vietnamese,
      Malayalam, Arabic, Hebrew, Devanagari, Bengali, Gurmukhi, Tamil, Telugu, Kannada, Thai, from Fontsource (OFL 1.1, no
      reserved names), loaded per alphabet, with per-character font fallback. OFL text and FAQ downloaded and handed to the
      owner for the release (verified in the release 2026-11-19, cited on the methods page). Chinese, Japanese and Korean
      added the same day (Fontsource's numbered files, only those a text needs; style chosen per line or by the visitor).
      Bold added the same day (Noto's bold files; own font: its bold file if added, else simulated). Urdu in Nastaliq (Noto Nastaliq Urdu) added the same day, with copied text fixed for letters that share a glyph and every line tagged (see DECISIONS.md). Form filling with these fonts added the same day.
- [ ] Pages with a `UserUnit` other than 1 (rare, very large pages) are untested.
- [ ] Multi-image TIFF: use every image, not only the first (`loadImage` in `web/ui.ts`; a source would then have
      several pages and `SourceData` needs one image per page).
- [ ] Keep bookmarks (outline) and document title when the output comes from a single source PDF.
- [ ] `ui.ts` re-draws the whole page grid on every change. Fine for hundreds of pages; revisit if slow.
- [ ] Optional password-protected output (the fork of pdf-lib can encrypt; check its API before promising).

## How to extend the design

The session's page list is the spine. Each output page is `{ src, page, rotate, scale }`; `build.ts` applies it.
New features should stay **non-destructive and serialisable** so undo and the settings file keep working:

- Add new per-page fields (for example `overlays: [...]`, `crop`) or new `output` fields (for example
  `compress: {...}`) to `web/session.ts`.
- Bump `VERSION` when the settings format changes, and make `parseSettings` accept older versions by filling
  defaults (it already ignores unknown output fields and defaults missing ones). Add tests for both directions.
- Apply the new fields in `web/build.ts` (keep it free of DOM code so it stays testable in Node), and draw them in
  previews in `web/render.ts`.
- Anything that can't be expressed without content (for example an image the visitor places on a page) must be
  treated as another *source*, fingerprinted and re-added like the PDFs, not embedded in the settings file.

## Phase 2: what is left

- [ ] Use each picture's real drawn size (from the page's content stream transform) instead of the page-based
      estimate, so small pictures on big pages are shrunk as far as the setting allows.
- [ ] Handle more picture kinds: 1-bit (CCITT/JBIG2) scans, indexed palettes, CMYK, pictures inside nested
      drawings (form XObjects are not walked for the page-size lookup; they fall back to the largest page).
- [ ] Keep colour profiles and store grey pictures as grey JPEGs (the browser canvas only writes colour JPEGs;
      would need a JPEG encoder library).
- [ ] Preview any page, not just the first, and run compression in a worker so the page stays responsive.
- [ ] Test in a browser with real-world scans and PDFs using PNG-predictor pictures.
- [ ] Named paper sizes (needs an archived source for the dimensions).

## Phase 2 (original notes): compression and scanned images

Owner's ask: "a wide variety of options that allows the user to make the trade-off in clarity, loss of
resolution, etc., along with an estimate of new size", and resizing the images in a scanned PDF separately from
the page size.

Suggested approach:

1. **Image recompression (keeps text as text).** Walk each page's image XObjects with pdf-lib's low-level API
   (`doc.context.enumerateIndirectObjects()`, streams with `/Subtype /Image`). For each: decode (DCTDecode = JPEG
   bytes the browser can decode directly; FlateDecode = raw samples; leave JBIG2, JPX, CCITT, masks and unusual
   colour spaces untouched at first), downsample on a canvas to a target pixels-per-inch (compute the image's
   effective resolution from its drawn size: needs the content stream's transform, or approximate with page size
   for full-page scans), re-encode as JPEG at the chosen quality, and replace the stream **only if smaller**.
   Options: target resolution, JPEG quality, greyscale, skip images below a size.
2. **"Flatten to pictures" mode** (strongest, lossy): draw each page with PDF.js at N dpi and rebuild the PDF from
   JPEGs. Must warn clearly that text can no longer be selected or searched.
3. **Lossless tidy:** re-save with object streams, drop unused objects and (optionally) metadata.
4. **Size preview:** don't guess from a formula. Run the real compression in a Web Worker and show the true
   size, with a before/after preview of one page; for long documents, compress a sample of pages and label the
   total as an estimate with its basis. Principle 2 applies: call it an estimate only when it is one.
5. **Scanned-image resize:** same machinery as 1, with the page box left alone; the reverse (change page size,
   keep image pixels) is already what `scale` does.

Test with pdf-lib-generated fixtures in Node where possible; pixel work needs the browser run.

## Phase 3: what is left

- [x] **Remove or redact existing content**: Redact PDF (2026-11-20) removes by rebuilding pages with areas as
      pictures (DECISIONS.md), with a check after saving. Follow-ups: ready-made searches (e-mail addresses, phone
      numbers, postcodes, card numbers); searching scans by reading them first; keeping the text of a redacted page
      as text outside the areas (needs exact letter positions and a content rewrite, with a check that nothing
      under an area survives); screen-reader tags on the pages that are kept (all tasks drop them today).
- [ ] More scripts for added text: embed a font with `@pdf-lib/fontkit`, served from this site, licence checked.
- [ ] Resize handles and on-canvas typing for text; touch gestures; keyboard-only editing checked.
- [ ] Shapes, lines, highlights, tick/cross marks; a freehand signature pad.
- [ ] Show additions in the small page previews.
- [ ] Changing existing text in place is not reliably possible in general; don't promise it.

## Phase 3 (original notes): editing page content

- **Adding** text, images, shapes, and moving/resizing/rotating what was added: an overlay model per page
  (`overlays: [{ type, x, y, w, h, rotate, ... }]`), drawn with pdf-lib (`drawText`, `drawImage`) at save time
  and on a canvas layer over the PDF.js preview while editing. Needs a single-page editing view.
- **Fonts:** pdf-lib's built-in fonts cover Western European characters only. For anything else, embed a font
  (`@pdf-lib/fontkit`) served from this site with a licence that allows it; state coverage limits.
- **Removing or changing existing text is the hard part.** PDF text is positioned glyph runs, often with subset
  fonts. Options, in order of honesty: (a) true removal by rewriting the content stream (drop the text-showing
  operators that fall inside a region), which is real redaction but needs a content-stream parser; (b) cover
  with a box. **A cover-up box alone leaves the text in the file, where it can be copied out. Never present (b)
  as removal or redaction**; if offered at all, label it as hiding, not removing. PDF.js's own annotation editor
  (`AnnotationEditorLayer`, shipped in `pdfjs-dist`) can add text, ink, highlights and images and save them; it
  is worth evaluating before writing an editor from scratch.
- **Editing existing text in place** (retyping a paragraph) can't be done reliably in general; don't promise it.

## Phase 4: conversions

Be strict about principle 2 here: most "PDF to Word" tools overclaim.

| Direction | Feasible locally? | Notes |
|---|---|---|
| Text → PDF | Yes | Lay out with pdf-lib; needs the font work from phase 3 for non-Western text |
| PDF → HTML | Partly | Text with positions via PDF.js `getTextContent`, images drawn per page; layout fidelity is limited |
| HTML → PDF | Partly | The honest route is the browser's own print-to-PDF (`window.print()` with a print stylesheet): real text, done locally by the browser. Canvas-based libraries produce pictures of pages. Remote pages can't be fetched (and must not be): local `.html` files only, and their external images won't load under the security policy |
| PDF → Word / PowerPoint / Excel | Partly | Can write files (candidates: `docx`, `pptxgenjs`, a spreadsheet writer) from extracted text, or page pictures on slides. Reconstructing paragraphs, tables and columns from a PDF is heuristic; label results as rough. Tables → Excel needs table detection |
| Word / PowerPoint / Excel → PDF | Only roughly without a big engine | Pure-JS routes (`mammoth` for .docx → HTML, then print) lose layout, fonts and pagination |

**Office → PDF: owner's decision (2026-11-16): yes, faithful conversion, provided it stays within GitHub's
free limits and breaks no licence or legal terms.** Others have done this by compiling LibreOffice to WebAssembly.
Work so far is on branch `office-to-pdf` (not merged); read `tools/pdf-tools/OFFICE-WIP.md` there. In short:

- **Engine tried:** npm `@matbee/libreoffice-converter` 2.7.2 (MPL-2.0, no CDN use found). In a direct trial in
  Chrome it converted docx, xlsx and pptx correctly in 1 to 3 seconds with no outside requests.
- **Hosting:** it needs cross-origin isolation headers GitHub Pages can't send, so a service worker adds them.
  Published gzip-compressed the engine is about 78 MB (site total 88 MB, limit 1 GB [GitHub Pages limits]).
  GitHub Pages has a soft limit of 100 GB of traffic a month: roughly 1,250 first-time engine downloads.
- **Blocker:** through the service worker, conversion is unreliable (sometimes 4 seconds, sometimes hangs).
- **Other engines found, not yet tried** (all small one-person projects; check licence and provenance first):
  `eze-paz/libreoffice-wasm` (needs no cross-origin isolation, so no service worker; Chrome/Edge 137+ only;
  binaries from GitHub releases, not npm), `Skitionek/serverless-office-converter` (runs on GitHub Pages,
  about 30 MB xz; its own code had no stated licence), ZetaOffice/`zetajs` from allotropia (the most
  established; by default loads the engine from the vendor's CDN, which this site must not do).
- **Licence duty if shipped:** LibreOffice is MPL-2.0; say so on the methods page and link to the source.

Also check each candidate library's licence and maintenance from its own repository before adding it, add it to
the "Software used" table on the methods page (it reads versions from `node_modules` at build time), and make
sure it is bundled, not fetched from elsewhere. Lazy-load heavy libraries with `import()` so the page stays light.

## Checks before any phase is called done

- `npm test` and `npm run build` pass.
- End-to-end run against `dist/` (the security policy only applies in production builds), with outputs verified
  by independent software, and results recorded in `VERIFICATION.md`.
- The methods page lists every new limit. The alpha notice on the tool page is updated.
- A row in `DECISIONS.md` for every significant choice.
