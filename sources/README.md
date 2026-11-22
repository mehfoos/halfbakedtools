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

**Owner's copies:** editors may save them to the private folder directly, under the same file name as in
`archive.json` where there is a public copy; the owner saves what an editor can't reach.

**Further-reading links** (for example an exercise how-to page) only help a reader do something; nothing on the site
relies on them. They aren't references: they aren't numbered or copied, and their source is named next to the link.

**Link check:** every three months a workflow (`link-check.yml`) checks every reference and further-reading link and
opens an issue listing those that fail. It never changes files: an editor fixes each one, re-checks the source and
updates `accessed`.

**Never commit reference files to the repository**: no PDFs, spreadsheets, datasets, zips or saved web pages, on
any branch. Anything committed stays in the repository's history for good. The tests fail if one appears.

**Web pages** are saved as one file that opens as the full page, with its text, pictures and layout: MHTML (`.mht`,
from Chrome's or Edge's *Save page as… > Webpage, Single File*, or headless Chrome's page snapshot) or a
self-contained HTML file (for example from the SingleFile browser extension).

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
