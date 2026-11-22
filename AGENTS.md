# Half-Baked Tools: the rules

For humans and AI, for every change. Read all of it first; it is short on purpose. If a request conflicts with a
rule, say so before acting. A rule changes only by editing this file, with a row in `docs/DECISIONS.md` saying why.

Half-Baked Tools (halfbakedtools.com) is a growing collection of small, free, open-source tools: some answer everyday
questions from published evidence, others are plain utilities. "Half-baked" means never finished, not low quality.
Its value is that people can check the work, so it is honest about what it does and doesn't do.

## Principles

1. **Accurate.** Take every value from the primary source itself, never from memory, a summary or another secondary
   source. Check it, and record the check (document, table or page, date) in the tool's `VERIFICATION.md`. Label
   anything unchecked "Not yet checked" on the site. When you find an error, even your own, fix it and record the fix.
2. **Honest.** Claim less than the tool does: results are estimates, limits are stated on the methods page and next
   to results where they matter, and there is no marketing language. **Never invent data**: no estimating,
   interpolating, extrapolating, borrowing a similar item's value, or using zero for a missing value. Missing data is
   shown as "NA", left off charts and explained on the page as "no data, not zero". A total that includes it is shown
   as "at least", and a result is never shown as a plain pass when missing data could change it. A derived value
   needs all its parts. Values a source itself marks as estimated or borrowed may be used, labelled as the source
   labels them. Any unavoidable assumption is stated where it applies, with its source. Status labels: `alpha` early;
   `beta` complete and checked against its sources; `stable` unlikely to change except for data updates.
3. **Traceable.** Every fact cites a source with `cite("id")`, listed in the tool's `references.json` (IEEE numbers,
   in order of first citation). Every source has an access date and an owner's private copy, recorded by file name
   and SHA-256 only, never by location. A public copy goes in the `source-archive` release only if numbers in a
   visitor's result come from it, its licence allows it, and the tool is a health tool or the source is hard to get
   again; otherwise the reference says why not. **Never commit reference files** (PDFs, spreadsheets, datasets, zips,
   saved web pages) on any branch: they stay in the history for good. If a download is blocked, ask the owner; never
   work around it. How to do all this: `sources/README.md`. Each tool's methods page records its method well enough
   to reproduce any result by hand, and is updated in the same commit as any change to the method.
4. **Private.** Nothing a visitor enters or opens leaves their browser. No cookies, analytics, accounts, third-party
   scripts, fonts or embeds; libraries are served from this site. Settings live in the page address and can be
   exported as a file; local storage only if the visitor opts in, and it can be cleared in one click. A tool that
   opens visitors' files sets a content security policy blocking other sites, with a test proving its code can't
   send data.
5. **Clear.** The default view asks for the minimum; everything else is one click away in a collapsible section,
   never removed. Use official values as defaults, offer other reputable standards where they exist, and show when a
   visitor's settings differ from the official ones. Charts: linear scales, no silent clipping, distinct targets, a
   named recognised scheme for categories, and never colour alone. Writing: British English, plain words, technical
   terms explained in passing; information, not advice, saying who to ask where it matters. Every caveat about data
   or status (alpha, beta, not yet checked, assumption, estimate, translated, borrowed) uses `caveat()` or
   `<Caveat>` from `site/src/lib/caveats.ts`, never hand-written.
6. **Self-contained and open.** Each tool lives entirely in `tools/<slug>/`; adding one needs no edits elsewhere.
   The shared shell and look live in `site/`. The site is static (GitHub Pages) and the code MIT; licence notices for
   bundled fonts or code sit next to what they cover. A tool's data is a snapshot in the repo, built only by the
   scripts in its `pipeline/` (Python standard library, run with `python3 -I`), never edited by hand and never
   changed silently: updates are committed, tested and deployed like code.

## Working on the repo

- Before committing, `npm test` and `npm run build` must pass; look at changed pages in a browser.
- Commit as `mehfoos <15526657+mehfoos@users.noreply.github.com>`, one change per commit, never squashed.
- Other sessions work on other tools at the same time. Touch only what you were asked to, don't create branches
  unless the owner asks, and report any conflict with a recommendation.
- Change anything visitors see only after the owner approves a rendered preview (desktop and phone).
- Do big jobs in small steps, each committed on its own, and pause after each.
- Record significant decisions with the reason: site-wide in `docs/DECISIONS.md`, tool-specific in the tool's
  `DECISIONS.md`.

## Adding a tool

1. `cp -r tools/_template tools/<slug>` (lower-case words and hyphens) and fill in `tool.json`; `health` is `true`
   if people may act on the tool's information for their health.
2. Pages go in `pages/`: `index.astro` is served at `/tools/<slug>/`, any other at `/tools/<slug>/<name>/`. Wrap each
   in `ToolLayout`; extra head tags go in `slot="head"`, and `"nav": false` in `tool.json` hides a page from the tabs.
   Keep every section of the template's `methods.astro`.
3. Calculations go in pure modules in `web/`, with `*.test.ts` tests beside them.
4. Fill in `references.json` (the template has one example of each kind), `VERIFICATION.md`, `DECISIONS.md` and
   `README.md`.
5. Published data goes in `data/`, the scripts that build it in `pipeline/`, scheduled jobs in
   `.github/workflows/<slug>-*.yml`. Library files loaded at run time are listed under `vendor` in `tool.json`.
6. Run `npm test`, which says exactly what is missing, then `npm run dev`; delete what's left of the template.
