# Source documents

Copies of every reference the site uses, kept so the exact version stays available if an official link moves
or a document is revised. The official links remain the primary references.

- The list of references, with citation details, licences and what each is used for: [`data/sources.json`](../../data/sources.json).
  The site numbers them [1], [2], … in that order.
- What is here, when it was retrieved, from where, and its SHA-256 checksum: [`manifest.json`](manifest.json).
  Check a copy with `sha256sum docs/sources/<file>`.
- Web pages are kept as both the raw HTML and a PDF print of the page.
- Missing copies are fetched by the **Archive sources** workflow (Actions tab → Archive sources → Run workflow).
  The USDA food data is archived as a release asset rather than here, because it is large.
- Not yet archived: WHO Technical Report Series 935 (the WHO site blocks automated downloads). Upload it as
  `who-2007-trs-935.pdf`.

Copies of documents under copyright (National Academies, WHO) are kept only so the values used here can be traced;
all rights remain with the publishers.
