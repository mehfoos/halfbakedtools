# Half-Baked Tools

Open, evolving tools for life's questions, with the evidence shown. Live at **https://halfbakedtools.com**.

Every tool on the site follows the same rules: accuracy comes before features, every claim is cited and
the cited documents are archived in this repository, methods and limitations are written down, and
calculations run in the visitor's browser.

## Tools

| Tool | Folder | Status |
|---|---|---|
| Nutrient planner: a few everyday foods that together meet UK, US or EU daily nutrient recommendations, or check your own day | [`tools/nutrient-planner/`](tools/nutrient-planner/) | Beta |

## Repository layout

```
tools/                     one self-contained folder per tool (see docs/ADDING_A_TOOL.md)
  <slug>/
    tool.json              name, summary, topic, status, pages: drives the home page and navigation
    pages/*.astro          the tool's pages, served at /tools/<slug>/ and /tools/<slug>/<page>/
    web/                   browser code and its tests (*.test.ts)
    references.json        the tool's references, in citation order ([1], [2], ...)
    VERIFICATION.md        what has been checked against which source, and when
    data/                  data the tool publishes (copied to the site at build time)
    pipeline/              scripts that build data/ (optional)
    README.md              how the tool works and how to maintain it
  _template/               copy this to start a new tool
site/                      the shared site shell
  src/layouts/             Base (header, footer) and ToolLayout (tool tabs + reference list)
  src/components/          shared components (References)
  src/lib/                 tool registry, IEEE reference formatting
  src/pages/               site-wide pages only: home, about, privacy
  src/styles/, public/     shared design, logo, fonts
sources/                   archived copies of every referenced document, shared by all tools,
                           with manifest.json (retrieval date, original URL, SHA-256)
scripts/                   site-wide scripts: data sync, source archiving
docs/                      setup and contributor guides
.github/workflows/         deploy, source archiving, per-tool data jobs (named <slug>-*.yml)
```

## Running locally

```bash
npm ci
npm test          # every tool's tests, plus checks that every tool folder follows the conventions
npm run dev       # http://localhost:4321
```

Tool-specific data builds are described in each tool's README.

## Licences

- Code: MIT (see `LICENSE`).
- Fonts: Averia Serif Libre and Averia Sans Libre, SIL Open Font Licence (`site/src/assets/fonts/OFL.txt`).
- Archived source documents in `sources/` remain under their publishers' terms; each tool's
  `references.json` records the licence of every document it cites.

Information only; not medical, financial or legal advice.
