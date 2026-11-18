# Source documents

## How archived copies are kept (from 18 Nov 2026)

New archived copies are kept as files of the repository's **`source-archive` release**, not in the repository:
anything committed stays in the repository's history for good, which makes every download of it bigger.

1. **List the file** in [`archive.json`](archive.json): its name (a short prefix, then the publisher's file name),
   what it is, publisher, licence, origin, and either `fetch` (an official download address) or `manual` (why it
   must be attached by hand), plus `sha256`, the checksum of the copy that was checked. `zip` builds one zip from
   several downloads, each checked against its own checksum.
2. **Run the workflow**: on GitHub, *Actions* -> *Archive sources to release* -> *Run workflow*. It creates the
   release the first time, downloads each missing file from its official address, checks it against the
   recorded checksum and uploads it only if it matches. A file that differs (for example because the publisher
   changed it) is never uploaded: a person must look at it and update the registry.
3. **Files that can't be downloaded automatically** (sites with browser checks or forms): open the
   [release](../../../releases/tag/source-archive), choose *Edit*, drag the file in under its exact name, save, then
   run the workflow again; it checks the attached file against the recorded checksum.
4. The workflow writes the verified checksums to [`release-manifest.json`](release-manifest.json) and lists every
   file's status on the run's summary page. Reference lists link to the release copy once it is verified, and say
   "archived copy not yet available" until then.

Releases are only created or changed when the owner runs the workflow.

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
- Missing copies are fetched by the **Archive sources** workflow, which runs when a `references.json` changes on
  `main` (or from the Actions tab). Large datasets are archived as release assets instead.
- Some publishers block automated downloads; those copies were downloaded by hand and are marked
  "uploaded by the site owner" in the manifest.

Copies of documents under copyright (for example National Academies and WHO publications) are kept only so the
values used here can be traced; all rights remain with the publishers.
