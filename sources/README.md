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

**Copies that can't be redistributed** (paywalled articles, or copies marked "all rights reserved" or "no further
distribution"; owner's decision, 20 Nov 2026) are not put in the release. The owner keeps them privately (for example in
Google Drive), and the tool's `references.json` lists them as `{"private": "<file name>", "sha256": "...", "reason":
"..."}`; they are not listed in `archive.json`. The reference list says the copy is kept privately and why, and shows
its checksum.

The *Archive sources to release* workflow (owner-run, from the Actions tab) was used once, in Nov 2026, to fill the
release with the files collected until then, including the copies that used to be committed to this folder; their
history was then removed from the repository. It can re-check everything, but is not needed for new files.

## About the archive

Copies of every document the site's tools cite, shared by all tools, kept so the exact version stays available if
an official link moves or a document is revised. The official links remain the primary references.

- Each tool lists the documents it cites, with citation details, licences and what each is used for, in
  `tools/<slug>/references.json`. The tool's pages number them [1], [2], … in that order.
- What each file is, where it came from, its licence and its SHA-256 checksum: [`archive.json`](archive.json);
  the checksums verified in the release, and when: [`release-manifest.json`](release-manifest.json). Check a
  downloaded copy with `sha256sum <file>`.
- Web pages are kept as both the raw HTML and a PDF print of the page.
- Some publishers block automated downloads; those copies were downloaded by hand and say so in `archive.json`.

Copies of documents under copyright (for example National Academies and WHO publications) are kept only so the
values used here can be traced; all rights remain with the publishers.
