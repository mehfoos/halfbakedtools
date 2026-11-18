# Adding a tool

A tool lives entirely in its own folder, `tools/<slug>/`. Nothing outside that folder needs editing: the home page,
the About page, navigation, page routes, data publishing, tests and source archiving all pick up new tool folders
automatically.

## Steps

1. **Copy the template:** `cp -r tools/_template tools/<slug>` (lower-case words joined by hyphens, e.g. `solar-payback`).
2. **Fill in `tool.json`:** set `slug` to the folder name, then the name, a one- or two-sentence summary, a topic (tools
   are grouped by topic on the home page), `status` (`alpha`, `beta` or `stable`) and the date added. List every page
   in `pages/`, starting with `index`. A page marked `"nav": false` is left out of the tab row (for tools with many
   pages reached from their own home page).
3. **Write the pages** in `pages/`. `index.astro` is served at `/tools/<slug>/`; any other `<name>.astro` at
   `/tools/<slug>/<name>/`. Wrap each page in `ToolLayout`, which adds the breadcrumb, the page tabs and the
   collapsible reference list. Every tool has a `methods` page covering how it works, what has been checked, and its
   limitations.
4. **Write the code** in `web/`. Keep calculations in pure modules (no DOM) with `*.test.ts` tests beside them; they
   run with `npm test` and must pass before anything deploys.
5. **Cite everything.** Add each source to `references.json`, in the order the tool first cites it, and cite it in the
   text with `cite("id")`, which produces a numbered IEEE-style link ([1], [2], …). Each source needs an archived copy
   in the `source-archive` release, given as `{"asset": "<file>"}`; follow `sources/README.md` (check the file, list
   it in `sources/archive.json`, the owner attaches it). **Never commit the file itself.** The tests fail if a
   citation isn't in `references.json`, a reference has no archived copy, or a reference file is committed.
6. **Record verification** in `VERIFICATION.md`: each value or table, the document and page it was checked against,
   and the date. Until something is checked, say so on the methods page.
7. **Data:** anything in `data/` (`*.json`, any depth) is published at `/tools/<slug>/data/…`. Scripts that build it
   go in `pipeline/`; scheduled jobs go in `.github/workflows/<slug>-*.yml`.
8. **Library files and page-level extras (rarely needed):**
   - If a library must load some of its own files by address at run time, list the folders under `"vendor"` in
     `tool.json` (for example `{ "pdfjs/cmaps": "pdfjs-dist/cmaps" }`); they are copied from `node_modules` and
     served at `/tools/<slug>/vendor/…`. Never load them from another site.
   - A page can add tags to the document head by giving them `slot="head"` inside `ToolLayout` (the PDF tools use
     this for a stricter security policy).
9. **Record the tool's intent and design decisions** in `DECISIONS.md`, with reasons.
10. **Run** `npm test` and `npm run dev`, then delete anything left over from the template.

## Rules every tool follows

These summarise [PRINCIPLES.md](PRINCIPLES.md), which gives the reasons; read it first.

- **Accuracy before features.** Prefer fewer, checked numbers to more, unchecked ones. Claim less and deliver more.
- **Calculations run in the browser.** Nothing a visitor enters is sent anywhere; no cookies, analytics or
  third-party scripts. Settings may be kept in the page address and, only if the visitor opts in, in local storage.
- **State limits plainly**, on the methods page and next to results where they matter.
- **Status labels mean something:** `alpha` = early version; `beta` = complete and checked against its sources;
  `stable` = unlikely to change except for data updates.
