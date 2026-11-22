# Intent and guiding principles

This is the reference for *why* Half-Baked Tools is built the way it is. Read it before adding a tool, changing a
number, or redesigning a page. When a change would break one of these principles, discuss it first and, if agreed,
update this file in the same change, with the reason.

Each principle has a short rule, the reason behind it, and what it means in practice.

## Intent

Half-Baked Tools (halfbakedtools.com) is an umbrella site for a wide-ranging collection of small, open-source
tools: some answer everyday questions from published evidence (what to eat, how to exercise), others are plain
utilities (working with PDF files). For the evidence-based tools, the value is that people can **check the numbers**;
for all of them, that they are honest about what they do and don't do. The site's own pages describe it in reserved
terms: no marketing, and no claims of accuracy beyond what has been checked. "Half-baked" means *never finished*: data gets updated, methods get refined and anyone can suggest
improvements. It does **not** mean low quality.

The first tool is the [nutrient planner](../tools/nutrient-planner/). More tools will follow, each in its own folder
(see [ADDING_A_TOOL.md](ADDING_A_TOOL.md)).

## 1. Accuracy comes before features

- **Rule:** a correct, checked number beats a new feature. If time is short, verify rather than build.
- **Why:** the site is only useful if its numbers can be trusted; one wrong value undermines every other value.
- **In practice:**
  - Values are transcribed from the original document, never from memory or a secondary summary when the primary
    source exists.
  - Each value is checked line by line against the archived original, and the check (document, table, page, date) is
    recorded in the tool's `VERIFICATION.md`.
  - Anything not yet checked is labelled "Not yet checked" on the site.
  - When a check finds an error, fix it, record what changed, and tell the people affected.
  - Secondary sources (encyclopaedias, manuals, AI summaries, blog posts) are only a pointer to the primary source.

## 2. Under-promise and over-deliver

- **Rule:** claim less than the tool can do, never more.
- **Why:** overclaiming erodes trust faster than anything else, and the subject matter (health, money) matters to
  people.
- **In practice:**
  - Results are called estimates.
  - Limitations are stated plainly on the methods page and next to results where they matter.
  - A tool doesn't hide uncertainty. Where data is missing, it says "not checked" rather than guessing or counting it
    as a pass.
  - **Data is never invented, estimated, interpolated or extrapolated.** A value comes from a cited source or it is
    missing. A missing value stays missing: it is not replaced by a similar food's value, an average, a guess or
    **zero**. It is shown as "NA" (not available) and left off charts; where other values can still be added up, the
    total is shown as a lower bound ("at least"). The page explains that NA means "no data", not zero, because a zero
    would count in favour of a limit and against a minimum. A result is never shown as a plain pass or "within the
    limit" when missing data could change it. A value derived from several others (for example EPA + DHA) is only
    computed when every part is known. Any unavoidable assumption is stated on the page where it applies, with its
    source.
  - Status labels are honest: `alpha` = early version; `beta` = complete and checked against its sources;
    `stable` = unlikely to change except for data updates.
  - No marketing language.

## 3. Every claim is referenced, every source is kept, and the sources behind results are public

- **Rule:** every fact traces to a source, in three layers (owner's decision, 20 Nov 2026):
  1. **Reference (every source, public).** IEEE-style citation, link to the original, version or DOI where there is
     one, what it is used for, its licence, and the date the original was last read and checked (`accessed`).
  2. **Owner's copy (every source, private).** The owner keeps a copy of every cited document or web page in a
     private folder. The repository records only the file name and its SHA-256, never where it is stored.
  3. **Public copy (some sources).** A copy in the `source-archive` release, only when all three answers are yes:
     - **Does a number or data in a visitor's result come from it?** (values transcribed or files read by a script:
       food tables, intake values and limits, MET values, effect sizes used in a calculation). If it is cited only
       for background or a general statement, no.
     - **Does its licence allow redistribution?**
     - **Is it in a health tool (`"health": true` in `tool.json`), or hard to obtain again** (blocked or manual
       downloads, releases that get replaced)?

     Otherwise the reference says why there is no public copy (`noPublicCopy`: `not-data`, `licence` or
     `easy-to-get`; `easy-to-get` is not allowed in a health tool).
- **Why:** readers must be able to check the work. The owner's copy means nothing is lost if a link moves, at no
  cost to the repository. A public copy is kept where a visitor or a future editor may need to check a number
  without the owner: the data that results are calculated from, above all where an error could harm someone.
- **In practice:**
  - **Citations:** IEEE style, [1], [2], …, numbered in each tool's `references.json`, in the order first cited.
  - **Reference list:** collapsible on the tool's pages. Each entry shows the citation, the access date, the link,
    the public copy (or why there isn't one) and whether the owner keeps a copy, with its checksum.
  - **Access date:** the date an editor last opened the original and confirmed it still says what we use. Set it
    when adding a reference and whenever it is re-checked. Older entries without a recorded date show
    "Access date not recorded" until re-checked; a new reference always has one.
  - **Owner's copies:** one private folder, with a subfolder per tool and a `shared` subfolder for sources used by
    more than one tool. Where there is a public copy, the file has the same name as in `sources/archive.json`.
    Editors may save copies there directly; the owner downloads what an editor can't reach. `references.json`
    gives `"ownerCopy": [{"file": ..., "sha256": ...}]`, or `"pending"` until it is saved. Never put a link,
    folder name, account or ID for the private folder in the repository.
  - **Web pages:** saved as a single file that opens as the full page, with its text, pictures and layout: MHTML
    (`.mht`: Chrome's or Edge's *Save page as… > Webpage, Single File*, or headless Chrome's page snapshot) or a
    self-contained HTML file (for example from the SingleFile browser extension). Plain HTML alone misses pictures
    and styles, and a PDF print can drop or rearrange content.
  - **Public copies:** files of the repository's `source-archive` release, never committed to the repository. An
    editor checks each new file is the right one and lists it in `sources/archive.json` with its official address,
    publisher, licence and the SHA-256 of the copy checked; the owner attaches it to the release by hand; the
    editor verifies the release copy (`scripts/archive_release.py --check`) and commits
    `sources/release-manifest.json`. A file that differs from the checked copy is never accepted. Copies already in
    the release stay there.
  - **Licence texts that must ship with the work** (font licences, notices of bundled software) are part of the
    site, not an archive: they stay next to what they cover, as the licence requires.
  - **Further-reading links:** a link that only helps a reader do something (for example an exercise how-to page),
    and that nothing on the site relies on, is not a reference: it isn't numbered or copied, and its source is
    named next to the link. It is still included in the link check.
  - **Link check:** every three months a workflow checks every reference and further-reading link and opens an
    issue listing those that fail. It never changes files: an editor fixes each one, re-checks the source and
    updates `accessed`.
  - **Blocked downloads:** if a document can't be downloaded automatically, say so and ask the owner to download
    it. Never substitute a guess, and never work around a site's blocks or terms.
  - **Tests:** they fail if a citation is missing from the reference list; a reference lacks `accessed`,
    `ownerCopy`, or a public copy or the reason for none; a private location appears in a reference; or a
    reference file is committed.

## 3a. The method is recorded in full

- **Rule:** every tool has a methods page (`pages/methods.astro`) that records its method in enough detail for
  someone to reproduce every result by hand. This is in addition to what the tool's own pages show; nothing is
  removed from them to make room.
- **Why:** results must be checkable, and a future editor must be able to tell a deliberate rule from a mistake
  without reading the code.
- **In practice,** the methods page covers, each point with its source cited:
  - **Inputs and defaults:** every option, its default and why.
  - **Data:** each source, its version and file, what is taken from it, and how it is converted (units,
    definitions, matching).
  - **Calculations:** every formula, rule, threshold and constant, with worked examples where they help.
  - **Missing data, assumptions and exclusions:** what is left out or assumed, how NA is treated, and which
    caveats are shown.
  - **What has been checked:** against which document, table or page, and when; and what hasn't been checked yet.
  - **Known limits.**
  - **Changes:** a short dated list of changes to the method.

  Long pages use collapsible sections. A change to how a tool works updates its methods page in the same commit;
  the tests fail if a tool has no methods page.

## 4. Privacy by default

- **Rule:** nothing a visitor enters leaves their browser.
- **Why:** people enter personal details (age, weight, health), and the site has no need to know them.
- **In practice:**
  - **Calculations:** they run in the browser.
  - **No tracking:** no cookies, analytics, third-party scripts, fonts or embeds.
  - **No accounts:** there is no sign-in. If one is ever added it is optional, and nothing is lost without it.
  - **Settings:** they live in the page address (shareable, bookmarkable), with export and import as a file.
  - **Remembering settings:** "Remember on this device" is opt-in, off by default, and can be forgotten in one click.

## 5. Resilient, owned data

- **Rule:** the site works even if an upstream source changes or disappears.
- **Why:** government datasets and websites change with politics and budgets.
- **In practice:**
  - Data snapshots are stored in the repository, and raw downloads are archived as releases.
  - Refreshes are scheduled, for example every three months.
  - Visitor-requested refreshes are rate-limited (not more than once in 90 days).
  - Refreshes never silently change results. They are committed, tested and deployed like code.

## 6. Simple by default, everything available on request

- **Rule:** the default view asks for the minimum and shows the essentials. Detail is one click away, never removed.
- **Why:** most visitors want a quick answer, and some want to check every assumption. Both should be served
  without clutter.
- **In practice:**
  - **Inputs:** few and plain, using sensible defaults from official reference values.
  - **Detail:** advanced settings, alternative standards and breakdowns sit in collapsible sections.
  - **Changing defaults:** visitors may override them, but the tool shows clearly when their settings differ from the
    official recommendation.
  - **Alternatives:** where several reputable standards exist (for example UK, US and EU), offer them, and show them
    side by side only where that doesn't clutter.

## 7. Charts and numbers must not mislead

- **Rule:** a visual must be read correctly at a glance.
- **Why:** a misleading chart is a false claim, even when the numbers behind it are right.
- **In practice:**
  - Linear scales unless stated otherwise, so bigger is visibly bigger (400% looks larger than 300%).
  - No silent clipping. If a view is zoomed, say so and mark values beyond the edge.
  - Targets are visually distinct.
  - Categories follow a recognised scheme (for example the food-label nutrition declaration), and the scheme is named.
  - Colour is never the only carrier of meaning.

## 8. Plain, honest writing

- **Rule:** British English, plain words, short sentences.
- **Why:** visitors aren't specialists, and clarity is part of accuracy.
- **In practice:**
  - **Terms:** explain technical ones in passing ("essential amino acids (protein building blocks)").
  - **Hedging:** say what is known and what isn't, without hedging every sentence.
  - **Not advice:** it is information only, not medical, financial or legal advice. For health topics, say who to ask
    (a GP, midwife or registered dietitian) where it matters.

## 9. Self-contained tools on a shared shell

- **Rule:** each tool lives entirely in `tools/<slug>/`. Adding a tool needs no edits elsewhere.
- **Why:** the site will grow. Tools should be added, changed or retired without touching each other.
- **In practice:**
  - The shared look, layout and site pages live in `site/`. Archived sources are shared: one release, one registry in `sources/`.
  - Tests check that every tool folder follows the conventions.
  - Per-tool jobs are named `<slug>-*.yml`.

## 10. Open and maintainable

- **Rule:** anyone can see, check and run everything.
- **Why:** transparency is the point; hidden steps can't be checked.
- **In practice:**
  - **Licence and hosting:** the code is MIT-licensed and the site is static, hosted on GitHub Pages.
  - **Data scripts:** they need nothing beyond what's in the repo (Python standard library), and generated files
    are rebuilt from scripts, never edited by hand.
  - **Look and feel:** navy on beige, light only, in the Alegreya and Alegreya Sans fonts (served from this site;
    sources and licences in `site/src/assets/fonts/`); the theme began as a copy of the owner's physicsoffusion.com
    site, and the logo is the owner's own.
  - **Commits:** they are made in the owner's name (`mehfoos`, using the GitHub no-reply address).

## Decision log

Record significant decisions here (site-wide) or in a tool's `DECISIONS.md` (tool-specific), newest first, with the
reason.

| Date | Decision | Reason |
|---|---|---|
| 2026-11-22 | Colours refined, keeping the owner's navy `#000080`: link hover `#00005a` (was `#0000ff`), rules `#c9c5a8` (were black), soft lines `#e4e1cc`, beige `#f7f5ea`, and a new accent `#9a5a1f` for later use | Owner's choice ("option 2"). Calculated contrast ratios: navy on white 16.0, accent on white 5.5, accent on beige 5.0 (own calculation, not a tool check). Rules are decorative only; form field borders are unchanged |
| 2026-11-22 | Fonts changed from Averia to Alegreya (text and headings) and Alegreya Sans (forms and tables), using the designers' own web font files unchanged, with their licence texts and checksums in `site/src/assets/fonts/` | Owner's choice. Averia has no OpenType features (so `tabular-nums` did nothing) and lacks characters the site uses (≤ ≥ → μ α ₂ and Ā), which fell back to another font. Breaking from physicsoffusion.com's fonts is fine |
| 2026-11-22 | The food and exercise tools share one home-page topic, "Health" (`topic` in each `tool.json`; `TOPIC_ORDER` in `site/src/lib/tools.ts`); folders and web addresses are unchanged, so no redirects are needed | Owner's request: visitors look for a subject, not a code folder, and two single-tool headings made the home page look thin. The first step of a wider look-and-feel refresh, recorded in the project plan |
| 2026-11-20 | References in three layers: every source has an access date and an owner's private copy (only its file name and checksum are in the repository); a public copy in the release only for sources that numbers in results come from, whose licence allows it, in a health tool or hard to obtain again. Web pages are saved as single-file MHTML or self-contained HTML. Links are checked every three months. Every tool records its full method on its methods page (principle 3a). `"health"` in `tool.json` replaces `"archive": "optional"` | Owner's review of the archive rules: one test that doesn't need rethinking for each new tool, and public copies only where a visitor or future editor may need them |
| 2026-11-20 | Sources that can't be redistributed are kept privately by the owner and listed as private copies; links that only help a reader (exercise how-to pages) are not references and aren't archived | Owner's decisions while checking the exercise planner's evidence |
| 2026-11-18 | One style for data caveats: fixed kinds (Alpha, Beta, Not yet checked, Assumption, Estimate, Translated, Borrowed), rendered by `caveat()` / `<Caveat>`; the existing alpha, "not yet checked" and estimate disclaimers converted; generated reports use the same labels | Owner: disclaimers of this nature should look and read the same everywhere |
| 2026-11-18 | History clean-up: the 39 copies once committed to `sources/` (and `docs/sources/`), the food tables, and deleted OpenStax copies were moved to the release and removed from the repository's history; `main` and `office-to-pdf` were force-pushed and the release tags moved (by a one-off owner-run workflow, then deleted); other clones must be re-cloned | The repository had reached about 180 MB of reference files; clones now stay small |
| 2026-11-20 | Archived copies are required for tools with health information and optional for utility tools (`"archive": "optional"` in `tool.json`); the PDF tools' four PDF/A references are cited without archived copies | The archive rule exists so people can check information that could harm them if wrong; for utility tools it costs the owner uploads for little benefit |
| 2026-11-18 | New archived copies are checked by an editor and attached to the release by the owner by hand; the editor verifies them with `archive_release.py --check`. No reference file is committed, on any branch; a test enforces it. The old *Archive sources* workflow, which committed downloads to `sources/`, is removed | Owner's choice: a manual upload after checking is simpler than more automation, and the repository must not grow |
| 2026-11-18 | Archived copies go to a `source-archive` GitHub release, listed in `sources/archive.json` with the checksum of the checked copy; an owner-run workflow downloads, checks and uploads them. Older files in `sources/` (and their history) to be moved in a one-off clean-up later | Committed files stay in the repository's history for good: the repository had reached 127 MB, a third of it files already deleted. Releases are created only when the owner runs the workflow |
| 2026-11-18 | Home page lists topics in a set order, food and health first (`TOPIC_ORDER` in `site/src/lib/tools.ts`); About says where source licences are recorded and how to ask for removal | Owner's request; the evidence-based tools are the site's main purpose. Licence text stays out of tool pages, as agreed |
| 2026-11-17 | Rule made explicit: data is never invented, estimated, interpolated or extrapolated; missing stays missing and is shown as NA, never as zero (principle 2; also in `AGENTS.md`) | Owner's requirement; zero-filling missing values could understate intake against a limit and was not disclosed per food |
| 2026-11-16 | A tool that handles visitors' files sets a browser security policy (CSP) on its page blocking connections to other sites, starts any background workers from blobs so the policy binds them too, and has a test that fails if its code can send data | Makes "nothing leaves the browser" enforced and checkable (first used by the PDF tools) |
| 2026-11-16 | Library files needed at run time are copied from `node_modules` and served by this site (`vendor` in `tool.json`) | No third-party requests |
| 2026-11-17 | The site's own pages (home, About) describe it in reserved, brief terms and cover utilities as well as evidence-based tools | Owner's instruction: don't sound confident about accuracy or market the site; the collection is wide-ranging |
| 2026-11-11 | Each tool is a self-contained folder; references numbered per tool; shared `sources/` archive | Site will host many tools |
| 2026-11-10 | IEEE-style numbered citations; collapsible reference lists with original and archived links | Traceability; owner's requirement |
| 2026-11-10 | Every cited document archived in the repo, including owner-uploaded copies | Links move and documents change |
| 2026-11-09 | Accuracy over features; claim less, deliver more; label anything not yet checked | Owner's standing instruction |
| 2026-11-08 | No sign-in; settings in the URL; opt-in local storage | Privacy, simplicity, GDPR |
| 2026-11-08 | Local data snapshot, quarterly refresh, visitor requests limited to once in 90 days | Resilience to upstream changes |
| 2026-11-08 | Name: Half-Baked Tools (halfbakedtools.com) | "Never finished", not "low quality" |
