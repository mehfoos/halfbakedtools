# Source documents

Copies of every document the site's tools cite, shared by all tools, kept so the exact version stays available if
an official link moves or a document is revised. The official links remain the primary references.

- Each tool lists the documents it cites, with citation details, licences and what each is used for, in
  `tools/<slug>/references.json`. The tool's pages number them [1], [2], … in that order.
- What is here, when it was retrieved, from where, which reference it belongs to, and its SHA-256 checksum:
  [`manifest.json`](manifest.json). Check a copy with `sha256sum sources/<file>`.
- Web pages are kept as both the raw HTML and a PDF print of the page.
- Missing copies are fetched by the **Archive sources** workflow, which runs when a `references.json` changes on
  `main` (or from the Actions tab). Large datasets are archived as release assets instead.
- Some publishers block automated downloads; those copies were downloaded by hand and are marked
  "uploaded by the site owner" in the manifest.

Copies of documents under copyright (for example National Academies and WHO publications) are kept only so the
values used here can be traced; all rights remain with the publishers.
