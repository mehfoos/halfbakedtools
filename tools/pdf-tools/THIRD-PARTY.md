# Third-party components shipped with the PDF tool

Everything below is copied from installed npm packages into the built site (`tool.json` "vendor", or bundled into the
page's script) at build time. None of it is committed to this repository. The methods page lists the code libraries
with versions and licences read from the installed packages when the site is built.

## Code

| Component | Licence | What we ship |
|---|---|---|
| pdfjs-dist (Mozilla PDF.js) | Apache-2.0 | Bundled; its fonts, character maps, decoders and colour profiles in `vendor/pdfjs/` |
| @cantoo/pdf-lib | MIT | Bundled |
| fflate | MIT | Bundled |
| utif2 | MIT | Bundled (loaded on first use) |
| tesseract.js | Apache-2.0 | Bundled (loaded on first use); its worker script `vendor/tesseract/worker.min.js` with its licence notice file |
| tesseract.js-core | Apache-2.0 | Three LSTM-only builds of the engine in `vendor/tesseract/core/`, plus its `LICENSE` |
| harfbuzzjs | MIT (the wrapper); HarfBuzz itself is "Old MIT" | Bundled (loaded on first use of your own font), with HarfBuzz compiled to WebAssembly (`_astro/harfbuzz.*.wasm`). HarfBuzz's notice is kept in `LICENSES/harfbuzz-COPYING.txt` (copied from github.com/harfbuzz/harfbuzz, COPYING, 2026-11-19) and shown on the methods page, as its licence asks |
| @cantoo/fontkit | MIT | Bundled (loaded on first use of your own font); with its dependencies brotli 1.3.3 (MIT, Devon Govett), dfa 1.2.0 (MIT, Devon Govett) and restructure (MIT). brotli and dfa ship no licence file; their package.json states MIT |
| bidi-js | MIT | Bundled (loaded with your own font) |

Licence files that come with the packages are copied to `vendor/licenses/` on the site (`tool.json` "vendor") and linked from the methods page.

## Fonts shipped with the site: Noto Sans

The font choice "Noto Sans (many alphabets)" uses these files, all version 5.3.0 of the Fontsource npm packages
`@fontsource/<family>` (Fontsource redistributes Google Fonts), weights 400 (regular) and 700 (bold), WOFF format, one file per alphabet and weight:
noto-sans (latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, vietnamese), noto-sans-malayalam (malayalam),
noto-sans-arabic (arabic), noto-sans-hebrew (hebrew), noto-sans-devanagari (devanagari), noto-sans-bengali (bengali),
noto-sans-gurmukhi (gurmukhi), noto-sans-tamil (tamil), noto-sans-telugu (telugu), noto-sans-kannada (kannada),
noto-sans-thai (thai), noto-nastaliq-urdu (arabic; Noto Nastaliq Urdu, font version 3.007); and for Chinese, Japanese and Korean, version 5.3.1 of noto-sans-sc, noto-sans-tc, noto-sans-jp
and noto-sans-kr, each split by Google Fonts into 97 to 120 numbered files (only those). The lists, with the characters
each file covers, are `web/notofiles.ts` and `web/cjkfiles.ts` (tests check them against each package's `unicode.json`).

- **Licence:** SIL Open Font License 1.1. Each package's `LICENSE` holds the copyright line ("Copyright 2022 The Noto
  Project Authors", with the year and the notofonts repository for each family; "Google Inc." for the Chinese, Japanese
  and Korean packages) and the licence text, and names **no Reserved Font Name** (checked 2026-11-19: the only match for the phrase is the licence's own definition of it).
- **How they are shipped:** each file is bundled into the site as its own script (base64), loaded only when text needs
  that alphabet. The licence of every family is served beside them in `vendor/licenses/` and linked from the methods
  page, as the OFL asks when fonts are redistributed (OFL FAQ 1.8: hosting fonts for others is allowed "as long as you
  make the full font package available"; archived as `pdftools_OFL-FAQ-1.1-update8.txt`).
- **In saved PDFs:** only the letters used are embedded. OFL FAQ 1.12: embedding in documents is allowed, "either in
  full or a subset", and 1.13: it does not change the document's licence. Fonts are not sold, by themselves or at all.
- **Nastaliq:** Noto Nastaliq Urdu's licence is the same ("Copyright 2022 The Noto Project Authors
  (https://github.com/notofonts/nastaliq)", OFL 1.1, no Reserved Font Name; embedding setting 0, i.e. no restriction;
  checked 2026-11-19).

## Fonts for PDF to PDF/A: Arimo, Tinos, Cousine

When a file uses Helvetica, Times or Courier without embedding them (PDF/A requires every font to be embedded), PDF to
PDF/A embeds Arimo, Tinos or Cousine in their place, which are drawn to the same widths. Version 5.3.0 of the
Fontsource npm packages `@fontsource/arimo`, `@fontsource/tinos` and `@fontsource/cousine`, "latin" and "latin-ext"
files, weights 400 and 700, upright and italic, WOFF format (font versions 1.341, 1.340 and 1.241). Not on the site yet:
they will be shipped the same way as Noto Sans above, with their licences in `vendor/licenses/`.

- **Licence:** SIL Open Font License 1.1. Copyright lines: "Copyright 2020 The Arimo Project Authors
  (https://github.com/googlefonts/arimo)", "Copyright 2026 The Tinos Project Authors (https://github.com/googlefonts/tinos)",
  "Copyright 2026 The Cousine Project Authors (https://github.com/googlefonts/cousine)". No Reserved Font Name (the
  phrase appears only in the licence's definition); every style's embedding setting (OS/2 fsType) has no restriction.
  Checked 2026-11-20.
- **In saved PDFs:** the whole Fontsource file is embedded (it is already a subset made by Google Fonts), which OFL FAQ
  1.12 allows, as for Noto Sans.
- **Not used:** PDF.js's Liberation fonts (GPL-2.0 with a font exception, plus a Red Hat licence on top), to keep every
  embedded font under one simple licence.

## OCR language models

`vendor/tesseract/lang/<code>.traineddata.gz`, from the npm packages `@tesseract.js-data/<code>` version 1.0.0, folder
`4.0.0_best_int`.

- **Packaging:** the npm packages are published under the MIT licence (their `package.json`).
- **Origin:** the packages' source repository (github.com/naptha/tessdata) describes `4.0.0_best_int` as the integerised
  version of Tesseract's "tessdata_best" models.
- **Model licence:** the tessdata_best repository (github.com/tesseract-ocr/tessdata_best) states that all data in it
  is licensed under the Apache License 2.0. Apache-2.0 allows commercial use and redistribution provided the licence
  is included; the engine's `LICENSE` (the Apache License 2.0 text) is shipped beside the models.
- **To archive (owner):** copies of the tessdata_best README and LICENSE, and the naptha/tessdata README, for the
  `source-archive` release (see ROADMAP "Sources to archive"). They were read through mirrors and search results on
  2026-11-19 because the build environment cannot open github.com pages directly.

Languages shipped (code, name): `eng` English, `ara` Arabic, `ben` Bengali, `bul` Bulgarian, `chi_sim` Chinese (simplified), `chi_tra` Chinese (traditional), `ces` Czech, `nld` Dutch, `fra` French, `deu` German, `ell` Greek, `grc` Greek, ancient, `heb` Hebrew, `hin` Hindi, `hun` Hungarian, `ita` Italian, `jpn` Japanese, `kan` Kannada, `kor` Korean, `kmr` Kurdish (Kurmanji, Latin script), `lat` Latin, `mal` Malayalam, `mar` Marathi, `nep` Nepali, `fas` Persian, `pol` Polish, `por` Portuguese, `pan` Punjabi (Gurmukhi script), `ron` Romanian, `rus` Russian, `slk` Slovak, `spa` Spanish, `tam` Tamil, `tel` Telugu, `tha` Thai, `tur` Turkish, `ukr` Ukrainian, `urd` Urdu, `vie` Vietnamese, `cym` Welsh.

## Our own work, no third-party design

- **The OCR text font** (`web/glyphless.ts`) is generated by our code. It has no glyph outlines (every character is
  the same empty glyph), so it reproduces no typeface. The idea follows Tesseract's own "glyphless" PDF font; no code
  or data was taken from it. It passes the OpenType Sanitizer used by Chrome and Firefox (checked 2026-11-19).
- **Visible text** added by the tools (Edit PDF text, Text to PDF, page numbers, watermarks) uses the PDF format's
  built-in fonts, which viewers supply themselves (no font file is embedded), the shipped Noto Sans files above, or a
  font file the visitor chooses from
  their own device ("Your own font"). The visitor's file is read in their browser and
  never uploaded; its maker's embedding setting (OS/2 fsType) is respected: "restricted" and "bitmap only" fonts are
  refused, "no subsetting" fonts are embedded whole, "preview and print" fonts are used with a note. That setting is
  not the licence, and the page tells visitors to use fonts they have the right to use. Form filling still uses the
  built-in font only.
