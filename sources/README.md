# Source documents

## How archived copies are kept (from 18 Nov 2026)

**Never commit reference files to the repository**: no PDFs, spreadsheets, datasets, zips or saved web pages, on
any branch. Anything committed stays in the repository's history for good, which makes every download of it
bigger. They are kept as files of the repository's **`source-archive` release** instead, and the tests fail if a
new one appears in the repository.

Adding a new archived copy:

1. **The editor finds and checks the file.** Use the publisher's official copy, and check it is the right one:
   the right document and version, the pages or tables actually cited, and the licence. If the site blocks
   downloads, don't work around it: ask the owner to download it.
2. **List it** in [`archive.json`](archive.json): its file name (a short prefix, then the publisher's file name),
   what it is, publisher, licence, origin (official address), and `sha256`, the checksum of the copy that was
   checked. Use `manual` to say how it was obtained.
3. **The owner attaches it to the release by hand**: open the [release](../../../releases/tag/source-archive),
   choose *Edit*, drag the file in under its exact registry name, and save. Releases are only changed by the owner.
4. **The editor verifies it**: `python3 -I scripts/archive_release.py --check` downloads each release file,
   checks it against the registry and records the verified ones in [`release-manifest.json`](release-manifest.json);
   commit that file. A copy that differs from the checked one is reported, not accepted.
5. **Cite it** in the tool's `references.json` with `{"asset": "<file name>"}`. The reference list links to the
   release copy once it is verified, and says "archived copy not yet available" until then.

The *Archive sources to release* workflow (owner-run, from the Actions tab) was used once to fill the release with
the files collected before Nov 2026, including the older copies that were committed to this folder (entries with
`fromRepo`, uploaded from the committed copy after checking its checksum). It can also re-check everything. It is
not needed for new files.

## Older copies in this folder

Copies of every document the site's tools cite, shared by all tools, kept so the exact version stays available if
an official link moves or a document is revised. The official links remain the primary references.

- Each tool lists the documents it cites, with citation details, licences and what each is used for, in
  `tools/<slug>/references.json`. The tool's pages number them [1], [2], … in that order.
- What is here, when it was retrieved, from where, which reference it belongs to, and its SHA-256 checksum:
  [`manifest.json`](manifest.json). Check a copy with `sha256sum sources/<file>`.
- Web pages are kept as both the raw HTML and a PDF print of the page.
- National food composition tables used by the nutrient planner are in [`food-tables/`](food-tables/), with their
  own manifest.
- No new files are added here (see above); these will be moved to the release in a one-off clean-up.
- Some publishers block automated downloads; those copies were downloaded by hand and are marked
  "uploaded by the site owner" in the manifest.

Copies of documents under copyright (for example National Academies and WHO publications) are kept only so the
values used here can be traced; all rights remain with the publishers.
