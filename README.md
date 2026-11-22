# Half-Baked Tools

Small, free, open-source tools for everyday questions and tasks; always a work in progress. Live at
**https://halfbakedtools.com**.

Accuracy comes before features, every claim is cited, methods and limits are written down, and everything runs in
the visitor's browser. **All the rules are in [AGENTS.md](AGENTS.md)**: read it before changing anything (human or AI).

## Tools

| Tool | Folder | Status |
|---|---|---|
| Nutrient planner: look up a food against UK, US or EU daily nutrient recommendations (Food Finder), find a few everyday foods that together meet them, or check your own day (Planner) | [`tools/nutrient-planner/`](tools/nutrient-planner/) | Beta |
| Exercise planner: choose the muscles (or heart and lung fitness) to train and the equipment you have, and get short lists of exercises that cover them | [`tools/exercise-planner/`](tools/exercise-planner/) | Alpha |
| PDF tools: merge, split, compress, edit and convert PDFs in the browser, with no upload (plan in its `ROADMAP.md`) | [`tools/pdf-tools/`](tools/pdf-tools/) | Alpha |

## Repository layout

```
AGENTS.md            the rules (CLAUDE.md points to it)
tools/<slug>/        one self-contained folder per tool; tools/_template/ is the starting point
  tool.json          name, summary, tagline, order, topic, status, health, pages
  pages/             the tool's pages, served at /tools/<slug>/…; one is methods.astro
  web/               browser code and its tests (*.test.ts)
  references.json    the tool's references, in citation order
  README.md, DECISIONS.md, VERIFICATION.md
  data/, pipeline/   published data, and the scripts that build it (optional)
site/                the shared shell: layouts, components, tool registry, styles, home/about/privacy pages
sources/             registry of archived source copies (the copies are files of the source-archive release)
scripts/             site-wide scripts: data sync, archive check, link check
docs/                DECISIONS.md (site-wide decision log), SETUP.md (hosting)
.github/workflows/   deploy, link check, source archiving, per-tool jobs (<slug>-*.yml)
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
- Fonts: Alegreya and Alegreya Sans, SIL Open Font Licence (licence texts and sources in `site/src/assets/fonts/`).
- Archived source documents (the `source-archive` release) remain under their publishers' terms; each tool's
  `references.json` records the licence of every document it cites.

Information only; not medical, financial or legal advice.
