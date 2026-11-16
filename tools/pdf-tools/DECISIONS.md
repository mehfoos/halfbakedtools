# PDF tools: design decisions

Tool-specific intent and decisions, newest first. Site-wide principles are in
[`docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md).

## Intent

For anyone who needs to change or convert a PDF and doesn't want to hand the file to a stranger's server:
contracts, payslips, medical letters, ID scans. It answers "can I do this common PDF job without uploading?".

Owner's requirements (16 November 2026), kept here so they aren't lost:

- **All processing happens locally in the browser. Nothing is ever uploaded to any server.** This is critical and
  outranks every feature. If a feature can't be done locally, it isn't offered.
- Conversions both ways between PDF and: Word and other document formats; PowerPoint and other slide formats;
  images (PNG, TIFF, JPEG, BMP, possibly SVG); Excel and other spreadsheet formats; text files; HTML.
- Editing: rearrange, duplicate and remove pages; resize the images in scanned PDFs separately from the page size;
  scale page size with contents; compress with a wide range of options and an estimate of the new size; split;
  extract; merge; edit content (add and remove text, formatting, resize and rotate, the same for images).
- Download the results, and also download settings that let the visitor re-apply their work and carry on later,
  without anything being stored on a server.

It deliberately does not: keep files between visits, offer accounts, or claim Word-perfect conversions.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-11-16 | Compress PDF shows the real size of the finished file, plus a before-and-after first page, before anything is downloaded | Owner asked for an "estimate of new size"; the true size is better than a guess (principle 2), and compression is fast enough to just do |
| 2026-11-16 | Default compression shrinks pictures only and never touches text; turning pages into pictures is a separate, clearly warned custom method | Keeps text sharp, selectable and accessible |
| 2026-11-16 | A picture's detail is estimated against its page, erring towards shrinking too little; unusual pictures are skipped and counted, not guessed at | Never damage what isn't understood; say what was skipped |
| 2026-11-16 | A recompressed picture is kept only if smaller, and a file that didn't shrink is not offered for download | Never hand back something worse |
| 2026-11-16 | Compression presets (200/150/100 dpi at 80/65/50% quality) are the tool's own choices | No standard defines them; labelled as such |
| 2026-11-16 | Compression options are stored in the settings file as an optional field; the format version stays 1 | Older files load with compression off; older code ignores the field |
| 2026-11-16 | Interface is task-first, after ilovepdf.com's way of working but in this site's own theme: a home grid of named tasks, each a focused page with one "select files" button, then previews with that task's few options and one action button. No branding, icons or colours are copied | Owner's request. People arrive wanting one job done; a single do-everything page made them find it |
| 2026-11-16 | Every task page is the same workspace (`components/Task.astro`, `web/ui.ts`) configured by `web/tasks.ts`; task pages are hidden from the tab row with `"nav": false` | One engine to test; adding a task is a few lines |
| 2026-11-16 | Tasks asked for but not built are shown on the home grid, greyed and labelled "Not built yet" | Honest about gaps; saves people hunting |
| 2026-11-16 | The PDF standard supplied by the owner is not committed to the repository | Owner's decision: its copyright notice says reproduction needs ISO's permission |
| 2026-11-16 | Office to PDF is on hold (work kept on branch `office-to-pdf`) | Owner's decision; it was unreliable through the service worker |
| 2026-11-16 | Built in phases; phase 1 is page arrangement, images and text. See `ROADMAP.md` | Too large for one pass; accuracy before features |
| 2026-11-16 | A browser security policy (CSP) on the tool page blocks connections to other origins, plus a test that scans the tool's code for network APIs | Makes "never uploaded" enforced and checkable, not just promised; covers third-party libraries |
| 2026-11-16 | The PDF.js worker's code is bundled as text and started from a blob, not from a web address | Measured in Chrome: a page's security policy does not bind a worker started from a web address, so the first published version's claim that the policy covered the libraries was too strong for PDF.js's worker. Blob workers inherit the policy. Corrected within the hour |
| 2026-11-16 | Libraries are npm packages bundled into the site; PDF.js fonts, character maps and decoders are copied to the site by `sync-data` | No CDN or third-party requests (principle 4) |
| 2026-11-16 | Edits are a non-destructive list of pages (`src`, `page`, `rotate`, `scale`) applied when saving | Makes undo, the settings file and testing simple; originals are never altered |
| 2026-11-16 | The settings file holds file names, sizes and SHA-256 fingerprints, never content or passwords; files are matched by fingerprint when re-added | Small, private, and safe to keep or share; detects a changed file |
| 2026-11-16 | Settings are a downloaded file, not kept in the page address or local storage | Departs from principle 4's "settings live in the page address" because the state refers to files, which an address can't carry; file names in an address could also leak into browser history |
| 2026-11-16 | Pages are copied, not re-drawn, when saving as PDF | No quality loss; text stays selectable |
| 2026-11-16 | `@cantoo/pdf-lib` rather than the original `pdf-lib` | The original has had no release since 2021; the fork is maintained and opens password-protected files |
| 2026-11-16 | JPEGs are embedded unchanged and the page is rotated to honour the photo's orientation note | No re-compression loss; phone photos come out upright |
| 2026-11-16 | Named paper sizes (A4, Letter) are not offered yet; resizing is by percentage | Their dimensions need a cited, archived source, which couldn't be downloaded from the build environment |
| 2026-11-16 | SVG output is not offered | PDF.js no longer draws to SVG; wrapping a bitmap in an SVG file would mislead |
| 2026-11-16 | Saved PDFs are not password-protected even if the source was; the tool says so | Writing encrypted PDFs isn't built; silence would mislead |
