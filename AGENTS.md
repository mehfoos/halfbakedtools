# Instructions for AI assistants (and a checklist for humans)

Read [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md) before making any change. It records the intent of this project and
the reasons behind its rules. If a request conflicts with a principle, point out the conflict before acting.

## Non-negotiables

1. **Accuracy first.** Take values from the primary source (the archived copy in `sources/`), never from memory or a
   secondary summary. Check each value against that copy, and record the check in the tool's `VERIFICATION.md`
   (document, table, page, date). Label anything unchecked as "Not yet checked" on the site.
2. **Claim less.** Don't describe a value as checked, a feature as complete or a result as precise unless it is.
   Report errors you find, even in your own earlier work.
3. **Cite and archive.**
   - Every fact on the site cites a source with `cite("id")`; the id is listed in the tool's `references.json`.
   - Every reference has an archived copy in `sources/`.
   - If you can't download a document (a blocked site or a paywall), **say so and ask the owner to download and upload
     it**. Don't work around the block, and don't fall back to a guess.
   - Commit any document the owner uploads to `sources/` and cite it.
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
- **Simple by default:** advanced options go in collapsible sections; don't add inputs to the default view without a
  strong reason.
- **Significant decisions:** add a row to the decision log in `docs/PRINCIPLES.md` (site-wide) or the tool's
  `DECISIONS.md` (tool-specific), with the reason.

## Where things are

- `docs/PRINCIPLES.md`: intent, principles and the decision log
- `docs/ADDING_A_TOOL.md`: how to add a tool
- `docs/SETUP.md`: hosting and repository setup
- `tools/<slug>/README.md`, `DECISIONS.md`, `VERIFICATION.md`: per-tool details
- `sources/`: archived source documents and `manifest.json`
