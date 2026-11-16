# PDF tools

Merge, split, reorder, rotate and resize PDF pages; save pages as images or plain text; turn images into a PDF.
Everything runs in the visitor's browser. **No file content ever leaves the device**: that is the tool's central
promise, and it is enforced (see "The no-upload guarantee" below).

**Status: alpha.** The interface is task-first (one page per job), modelled on how ilovepdf.com works but in this
site's theme. Compression, in-page editing and Office/HTML conversions are not built.
**If you are continuing this work, start with [`ROADMAP.md`](ROADMAP.md).**

## How it works

- The visitor adds PDFs and images. Each is read into memory with the browser's File API and fingerprinted (SHA-256).
- The **session** (`web/session.ts`) is a list of sources (name, size, fingerprint, never content) and a list of
  output pages, each `{ src, page, rotate, scale }`. Every edit is a pure function returning a new page list.
- **Saving as PDF** (`web/build.ts`) copies the listed pages from the sources into new PDFs with pdf-lib, then
  applies rotation and scale. Pages are copied as they are: no re-compression, text stays text.
- **Saving as images or text** (`web/render.ts`) draws or reads each page with PDF.js.
- **The settings file** is the session as JSON. Loading it and re-adding the same files (matched by fingerprint)
  restores the work. It holds no content and no passwords.

## The no-upload guarantee

1. `web/csp.ts` is a Content-Security-Policy, set in a `<meta>` tag on the tool page (production builds), that makes
   the browser refuse connections to any other origin and all form submissions.
   **A page's policy does not bind workers started from a web address**, so every worker must be started from a
   blob (see `web/render.ts`); then the policy covers the libraries too.
2. `web/privacy.test.ts` fails `npm test` (and so blocks deployment) if this tool's own code contains a network
   API, if its pages load anything from another site, or if the policy is weakened.
3. Libraries are bundled from `node_modules`; PDF.js support files are copied by `scripts/sync-data.mjs` (the
   `vendor` list in `tool.json`) and served from this site. No CDN, ever.

Never add: a server-side step, a third-party script or font, telemetry, or "remember my files" storage.

## Files

- `tool.json`: name, summary, status, pages, and `vendor` (library folders to serve)
- `web/tasks.ts`: the list of tasks (Merge PDF, Split PDF, ...) and which controls each shows
- `components/Task.astro`: the page every task uses; `pages/<task>.astro` are one-line wrappers
- `pages/index.astro`: the grid of tasks; `pages/methods.astro`: how it works, checks and limits
- `web/ranges.ts`: page-range text ("1-3, 5, 8-")
- `web/session.ts`: session model, page edits, split plan, settings file (read and write)
- `web/build.ts`: writes PDFs (pdf-lib). No DOM, so it is tested in Node
- `web/render.ts`: browser-only PDF.js wrapper (previews, page images, text)
- `web/bmp.ts`, `web/text.ts`, `web/exif.ts`: small pure helpers
- `web/csp.ts`: the security policy
- `web/ui.ts`: wires everything to the page
- `web/core.test.ts`, `web/privacy.test.ts`: tests
- `DECISIONS.md`, `VERIFICATION.md`, `ROADMAP.md`

## Maintaining

- `npm test`, then `npm run build`. The policy is only applied in production builds, so check behaviour against
  `dist/` (for example `python3 -m http.server -d dist`), not only `npm run dev`.
- When updating `pdfjs-dist` or `@cantoo/pdf-lib`, re-run the end-to-end checks listed in `VERIFICATION.md`.
- There is no `references.json` yet because no page cites a source. Add one when the first citation is needed
  (see `ROADMAP.md`, "Sources to archive").
