# Instructions for AI assistants (and a checklist for humans)

Read [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) before making any change. It records the intent of this project and
the reasons behind its rules. If a request conflicts with a principle, point out the conflict before acting.

How the two files relate: `docs/PRINCIPLES.md` is the *why* (intent, rules, reasons, decision log). This file is the
*what to do*: a short checklist and map for whoever is about to change something. The non-negotiables below summarise
the principles; if the two ever differ, `PRINCIPLES.md` wins and this file should be corrected.

## Non-negotiables

1. **Accuracy first.** Take values from the primary source (its archived copy in the `source-archive` release), never from memory or a
   secondary summary. Check each value against that copy, and record the check in the tool's `VERIFICATION.md`
   (document, table, page, date). Label anything unchecked as "Not yet checked" on the site.
2. **Claim less.** Don't describe a value as checked, a feature as complete or a result as precise unless it is.
   Report errors you find, even in your own earlier work.
   **Never invent data.** Don't estimate, interpolate, extrapolate or borrow a value from a similar item. A value comes
   from a cited source or it is missing, and missing stays missing and is shown as missing ("NA", not available). **Never
   substitute zero**: zero is a real value and affects limits differently from minimums. Show NA (or an "at least" lower
   bound), say on the page that NA means "no data", not zero, and never show a plain pass when the missing data could
   change the result. Read principle 2 in `docs/PRINCIPLES.md` before touching any calculation that uses data.
3. **Cite and archive.**
   - Every fact on the site cites a source with `cite("id")`; the id is listed in the tool's `references.json`.
   - **Never commit reference files** (PDFs, spreadsheets, datasets, zips, saved web pages) to the repository, on
     any branch, even temporarily: they stay in its history for good. The tests fail if you do.
   - Every reference has an archived copy in the **`source-archive` release**. For a new one: find the official copy and check it's the right document and
     version; list it in `sources/archive.json` with its origin, licence and SHA-256; give it to the owner (or ask
     them to download it), who attaches it to the release by hand; then run
     `python3 -I scripts/archive_release.py --check`, commit `sources/release-manifest.json`, and cite it as
     `{"asset": "<file>"}`. You can't create or change releases yourself. See `sources/README.md`.
   - If you can't download a document (a blocked site or a paywall), **say so and ask the owner to download and upload
     it**. Don't work around the block, and don't fall back to a guess.
   - A document the owner uploads to you: check it the same way, list it in `sources/archive.json`, and ask the
     owner to attach it to the release. Don't commit it.
4. **Privacy.** No cookies, analytics, third-party scripts, fonts or embeds; no sending visitor input anywhere;
   local storage only when the visitor opts in.
5. **Don't mislead with charts.** Use linear scales, no silent clipping, distinct targets, and never colour alone.
6. **Keep tools self-contained.** All of a tool's files go in `tools/<slug>/`, following
   [`docs/ADDING_A_TOOL.md`](docs/ADDING_A_TOOL.md). Shared code goes in `site/`.

## Working conventions

- **Generated files:** edit the scripts in `tools/<slug>/pipeline/`, never the generated files in `tools/<slug>/data/`.
  Python scripts use the standard library only and run with `python3 -I`.
- **Before committing:** run `npm test` and `npm run build`; both must pass. Look at changed pages in a browser.
- **Commits:** author them as `mehfoos <15526657+mehfoos@users.noreply.github.com>`.
- **Writing:** British English and plain words, explaining technical terms in passing. Information only, not advice.
- **Data caveats:** every disclaimer about data or a tool's status (alpha, beta, not yet checked, an assumption, an
  estimate, a translation, a borrowed value) uses one style: `caveat(kind, html)` from `site/src/lib/caveats.ts`
  in TypeScript, or `<Caveat kind="...">` in Astro pages, with one of the kinds defined there. Never write one by
  hand (a test checks). Generated reports use the same labels (`site/src/lib/caveats.json`, `> **[Label]** text`).
  In the food-data pipeline, caveats are listed in `tools/nutrient-planner/pipeline/blend/caveats.csv` with their
  reason and evidence, and attached to the values they apply to.
- **Simple by default:** advanced options go in collapsible sections; don't add inputs to the default view without a
  strong reason.
- **Significant decisions:** add a row to the decision log in `docs/PRINCIPLES.md` (site-wide) or the tool's
  `DECISIONS.md` (tool-specific), with the reason.

## Where things are

- `docs/PRINCIPLES.md`: intent, principles and the decision log
- `docs/ADDING_A_TOOL.md`: how to add a tool
- `docs/SETUP.md`: hosting and repository setup
- `tools/<slug>/README.md`, `DECISIONS.md`, `VERIFICATION.md`: per-tool details
- `sources/`: `archive.json` (registry of files in the `source-archive` release), `release-manifest.json`
  (their verified checksums). The files themselves are only in the release
