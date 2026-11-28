# Source documents

## What is kept, and where (from 20 Nov 2026)

Every source cited on the site has three layers (principle 3 in [`AGENTS.md`](../AGENTS.md)):

1. **The reference**, in the tool's `references.json`, with `accessed`: the date the original was last read and
   checked.
2. **The owner's private copy**, for every source, in a private folder (a subfolder per tool and one called `shared`).
   `references.json` records only its file name and SHA-256 (`ownerCopy`), or `"pending"` until it is saved. Never
   write a link, folder name, account or ID for the private folder anywhere in the repository.
3. **A public copy** in this repository's **`source-archive` release**, only where numbers or data in a visitor's
   result come from the source, its licence allows redistribution, and the tool is a health tool or the source is
   hard to obtain again. Otherwise `references.json` says why there is none (`noPublicCopy`).

**Owner's copies:** saved as described below, under the same file name as in `archive.json` where there is a public
copy; the owner saves what nothing else can reach.

**Further-reading links** (for example an exercise how-to page) only help a reader do something; nothing on the site
relies on them. They aren't references: they aren't numbered or copied, and their source is named next to the link.

**Link check:** every three months a workflow (`link-check.yml`) checks every reference and further-reading link and
opens an issue listing those that fail. It never changes files: an editor fixes each one, re-checks the source and
updates `accessed`.

**Never commit reference files to the repository**: no PDFs, spreadsheets, datasets, zips or saved web pages, on
any branch. Anything committed stays in the repository's history for good. The tests fail if one appears.

**Web pages** are saved as one file that opens as the full page, with its text, pictures and layout: MHTML (`.mht`,
from Chrome's or Edge's *Save page as… > Webpage, Single File*, or headless Chrome's page snapshot) or a
self-contained HTML file (for example from the SingleFile browser extension). `node scripts/snapshot_pages.mjs LIST.tsv
OUT_DIR` saves a list of pages as MHTML with headless Chrome, outside the repository, and writes each file's SHA-256
to a `manifest.json`; pages that refuse (403, 429, a "just a moment" check) are reported, not retried.

### Saving owner's copies (from 28 Nov 2026)

Editors save owner's copies from their chat, through the owner's Chrome, with the owner's MacBook awake and Chrome
(university profile, with the Claude in Chrome extension) and Google Drive for desktop running. Chrome saves
downloads into the private folder's `_inbox`, which Drive for desktop uploads within seconds. Pages that block
automated downloads but open in the owner's Chrome count as reachable (owner, 28 Nov 2026).

1. **List each copy** in the tool's `references.json`: `"ownerCopy": [{"file": "<prefix>_<name>.html", "pending":
   true}]`. Optional: `"fetch"` when the file isn't at `url` (for example a direct PDF link); `"folder": "shared"`
   for a source several tools cite (otherwise it goes in the tool's own folder).
2. **Save it in Chrome**, in a new tab: a web page with `scripts/browser_snapshot.js` (one self-contained HTML file:
   pictures, styles and fonts embedded, scripts removed); a file (PDF, spreadsheet, ...) by opening its address and
   running `scripts/browser_save_file.js`. Both save under the exact `file` name and return its SHA-256.
   **For a web page, also keep screenshots** (from 28 Nov 2026, new copies only), so a person can check the HTML
   copy for missing fonts or unexpected changes: scroll the live page one window-height at a time, screenshot each
   position (with the mouse moved off the page), join them with `python3 -I scripts/screens_to_pdf.py
   <name>.screens.pdf SHOT:SCROLL_Y ...`, and upload that file with the Drive connector's `create_file` (it stays
   under about 3 MB) next to the HTML copy. It isn't listed in `references.json`.
3. **File it**: when it appears in `_inbox`, copy it with the Google Drive connector (`copy_file`, title = the file
   name) into the tool's folder, and check the size matches. The connector can't move or delete what Drive for
   desktop uploaded, so the `_inbox` copy stays.
4. **Record it**: put the SHA-256 in place of `"pending"`, and commit `references.json`.
5. **Tell the owner** which `_inbox` files are filed and can be deleted. The rule: a file in `_inbox` can be
   deleted once a file of the same name is in a tool's folder (or `shared`). When the owner asks what can be
   deleted, list `_inbox` with the connector, check each name against the folders, and answer in two groups: safe
   to delete (filed) and keep (not filed yet).

Never write the private folder's name, link or ID in the repository. Never replace or delete a copy that's already
filed; ask the owner. The connector can rename, move and trash files it created itself (most of the folder), but not
files the owner added by hand; check a file's capabilities first.

**Bulk check (optional):** `scripts/sync_owner_copies.py` compares every listed copy with the folder and, with
`--verify`, downloads each to check its SHA-256; with `--apply` it also saves missing copies itself and files
`_inbox` copies. It needs the rclone login, so it runs only in a Claude Code session on the owner's `hbt-archive`
environment (never in a Project chat).

### Adding a public copy

1. **The editor finds and checks the file.** Use the publisher's official copy, and check it is the right one:
   the right document and version, the pages or tables actually cited, and the licence. If the site blocks
   downloads, don't work around it: ask the owner to download it.
2. **List it** in [`archive.json`](archive.json): its file name (a short prefix, then the publisher's file name),
   what it is, publisher, licence, origin (official address), `retrieved` (date downloaded), and `sha256`, the
   checksum of the copy that was checked. Use `manual` to say how it was obtained.
3. **The owner attaches it to the release by hand**: open the [release](../../../releases/tag/source-archive),
   choose *Edit*, drag the file in under its exact registry name, and save. Releases are only changed by the owner.
4. **The editor verifies it**: `python3 -I scripts/archive_release.py --check` downloads each release file,
   checks it against the registry and records the verified ones in [`release-manifest.json`](release-manifest.json);
   commit that file. A copy that differs from the checked one is reported, not accepted.
5. **Cite it** in the tool's `references.json` with `{"asset": "<file name>"}`. The reference list links to the
   release copy once it is verified, and says "public copy not yet available" until then. Save the same file, under
   the same name, as the owner's copy.

### Sources without a public copy

`references.json` gives `"noPublicCopy": {"why": ..., "note": ...}`:

- `licence`: the publisher doesn't allow redistribution (paywalled, "all rights reserved", "no further
  distribution"). Never list such a file in `archive.json`.
- `not-data`: cited for background or a general statement; no number in a result comes from it.
- `easy-to-get`: freely available from its publisher and not hard to obtain again. Not allowed in a health tool.

Copies already in the release stay there, even where the rule would no longer require them.

The *Archive sources to release* workflow (owner-run, from the Actions tab) was used once, in Nov 2026, to fill the
release with the files collected until then, including the copies that used to be committed to this folder; their
history was then removed from the repository. It can re-check everything, but is not needed for new files.

## About the public archive

Copies of the documents the site's results are calculated from, shared by all tools, kept so the exact version
stays available to everyone if an official link moves or a document is revised. The official links remain the primary references.

- Each tool lists the documents it cites, with citation details, licences and what each is used for, in
  `tools/<slug>/references.json`. The tool's pages number them [1], [2], … in that order.
- What each file is, where it came from, its licence and its SHA-256 checksum: [`archive.json`](archive.json);
  the checksums verified in the release, and when: [`release-manifest.json`](release-manifest.json). Check a
  downloaded copy with `sha256sum <file>`.
- Web pages archived before 20 Nov 2026 are kept as the raw HTML and a PDF print; newer ones as MHTML or
  self-contained HTML.
- Some publishers block automated downloads; those copies were downloaded by hand and say so in `archive.json`.

Copies of documents under copyright (for example National Academies and WHO publications) are kept only so the
values used here can be traced; all rights remain with the publishers.
