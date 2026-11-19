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
| 2026-11-17 | Watermark is text only for now, drawn on top of the page, and the page says it is a label that can be removed, not protection | Drawing behind existing content and picture watermarks are follow-ups; claiming protection would mislead |
| 2026-11-17 | Page numbers (and later the watermark) are "stamps": save options applied to every page as it will finally be seen, after turning and resizing, drawn with the same code as added text (`web/stamps.ts`). The task shows a live preview built as a real PDF | Same size and place on every page whatever its rotation; one drawing path to test; what is previewed is what is saved |
| 2026-11-16 | Protect PDF sets one password that grants full access, encrypts with the library's default (AES-256), and is the last step applied to a file. The password is never stored, including in the settings file | Simple to understand; separate "owner" restrictions are not real security, since this very tool removes them |
| 2026-11-16 | Unlock PDF only opens files with a password the visitor supplies; it never guesses | It is for people's own files |
| 2026-11-16 | The tool list follows ilovepdf.com's, built one small chunk at a time (queue in `ROADMAP.md`). Tools that need a server (AI summary and translation, phone-to-browser scanning, requesting signatures, web address to PDF) are listed on the home page as not offered, with the reason | Owner's request, and local-only outranks parity |
| 2026-11-16 | Home grid uses their categories with filter buttons; unbuilt tools sit greyed inside their category | Owner's request; people look for a tool where they expect it |
| 2026-11-16 | Two stronger compression levels added: Extreme (pictures at 72 dpi, 30% quality, text kept) and Maximum (whole pages redrawn as pictures, with the text-loss warning shown) | Owner asked for more extreme options in addition to the existing ones |
| 2026-11-16 | Edit PDF (first part) adds text and pictures only. No "cover with a box" tool is offered | A covered word is still in the file and can be copied out; offering it would look like removal (principle 2). True removal needs content-stream rewriting: see `ROADMAP.md` |
| 2026-11-16 | The editor shows the page rebuilt as a real PDF after every change; on-screen boxes are only handles | Guarantees what is seen is what is saved, with no second text-layout engine to drift out of step |
| 2026-11-16 | Additions are stored per page, in points from the top-left of the page as the file shows it, before any turn or resize made in the tool | They then turn, resize, duplicate and move with their page, and survive the settings file |
| 2026-11-16 | Added text uses the PDF format's built-in fonts (Helvetica, Times, Courier; regular and bold) | Nothing to embed or download; every PDF viewer has them. Cost: Western European characters only, stated in the page and enforced before saving |
| 2026-11-16 | A picture placed on a page is another fingerprinted source in the settings file, not embedded in it | Keeps the settings file free of content |
| 2026-11-16 | Default output names carry a task suffix (`report-merged.pdf`, `scan-compressed.pdf`). If the visitor's chosen name matches a file they added, the tool stops and asks before saving | Owner's request: never overwrite an original by accident. A web page can't see the visitor's folders, so matching against the names of added files is the check that is possible; the page says so |
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
| 2026-11-19 | Whole-file tasks (Split, Compress, Unlock, Protect, Page numbers, Watermark, PDF to text) show a file list, not page thumbnails | The pages can't be acted on separately there, and hundreds of thumbnails buried the options and the button |
| 2026-11-19 | Page lists are shown a screenful at a time, sized to the screen, rather than as one long scrolling list | Long files stayed usable; fewer thumbnails drawn at once; selection still covers every page |
| 2026-11-19 | Selection starts as "all" for Rotate, Resize and PDF to picture tasks, but "none" for Remove, Extract, Merge and Organise | "All" there only means "use these pages"; for Remove it would delete the lot |
| 2026-11-19 | Crop sets the page's crop box and does not delete anything; the page says so | Content outside stays in the file; calling it removal would mislead (true removal is the Redact chunk) |
| 2026-11-19 | Crop margins are absolute (points, shown in mm, inches or points) and the same on every chosen page | Simple and predictable; a percentage option is a follow-up |
| 2026-11-19 | Resizing scales every page box itself instead of calling the library's `page.scale` | The library resets the crop box to the full page size, which shows the wrong area on any page that is already cropped |
