# PDF tools: roadmap and handover notes

For whoever continues this work, human or AI. Read [`AGENTS.md`](../../AGENTS.md), [`docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md),
then this tool's [`README.md`](README.md) and [`DECISIONS.md`](DECISIONS.md) (which records the owner's full
requirements) first.

**The rule that outranks everything: no file content leaves the browser.** No server step, no CDN, no third-party
request. `web/privacy.test.ts` and the security policy in `web/csp.ts` enforce it; never weaken either to make a
feature work. Any new worker must be started from a blob, or the policy won't bind it (see `README.md`). If a feature can't be done locally, don't offer it, and say so.

## Where things stand

| Phase | Scope | Status |
|---|---|---|
| 1 | Skeleton, no-upload enforcement, merge, reorder, duplicate, remove, rotate, resize page with contents, split, extract, PDF → images (PNG, JPEG, WebP, TIFF, BMP) and text, images → PDF, settings file | **Done 2026-11-16** (alpha) |
| 2 | Compression with options and size preview; resize images inside scanned PDFs independently of page size; named paper sizes | Not started |
| 3 | Edit page content: add text and images, move/resize/rotate them, remove or redact content | Not started |
| 4 | Text and HTML ↔ PDF; Word, PowerPoint, Excel (and OpenDocument) ↔ PDF; PDF → SVG | Not started |

Owner requirements not yet met are exactly phases 2 to 4. Nothing in phase 1 is known to be broken; the unchecked
items are listed at the bottom of [`VERIFICATION.md`](VERIFICATION.md).

## Loose ends from phase 1 (small; do these first)

- [ ] Check in Firefox, Safari and on a phone; check drag-and-drop; try large and awkward real-world PDFs
      (hundreds of pages, scans, forms, CJK text). Record results in `VERIFICATION.md`.
- [ ] **Sources to archive.** The owner supplied the PDF standard (PDF 32000-1:2008) and the unit was checked
      against it (see `VERIFICATION.md`), but the file is not committed: its copyright notice says permission to
      reproduce must be arranged with ISO. Awaiting the owner's decision on archiving it publicly. Still needed: a
      source for ISO 216 (A-series) and US Letter/Legal dimensions (downloads are blocked from the build
      environment; ask the owner to upload). Then add `references.json`,
      cite them on the methods page, tick them off in `VERIFICATION.md`, and offer named paper sizes.
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

## Phase 2: compression and scanned images

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

## Phase 3: editing page content

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

**Decision needed from the owner before building Office → PDF:** faithful conversion needs a real office engine.
LibreOffice compiled to WebAssembly exists and runs fully in the browser, but it is a very large download (tens of
megabytes), would have to be self-hosted on this site (never loaded from its vendor's CDN), needs
cross-origin-isolation headers that GitHub Pages can't set directly, and is licensed MPL-2.0. The alternatives
are a rough pure-JS conversion with plainly stated limits, or not offering that direction. Check current facts
(size, licence, hosting needs) from primary sources before deciding; the details above are from general
knowledge and are **not yet checked**.

Also check each candidate library's licence and maintenance from its own repository before adding it, add it to
the "Software used" table on the methods page (it reads versions from `node_modules` at build time), and make
sure it is bundled, not fetched from elsewhere. Lazy-load heavy libraries with `import()` so the page stays light.

## Checks before any phase is called done

- `npm test` and `npm run build` pass.
- End-to-end run against `dist/` (the security policy only applies in production builds), with outputs verified
  by independent software, and results recorded in `VERIFICATION.md`.
- The methods page lists every new limit. The alpha notice on the tool page is updated.
- A row in `DECISIONS.md` for every significant choice.
