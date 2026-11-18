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

## 3. Every claim is referenced, and every reference is archived

- **Rule:** each fact traces to a source, and that source is kept in this repository.
- **Why:** readers must be able to check the work. Official links move and documents get revised, so the exact
  version used has to survive.
- **In practice:**
  - **Citations:** IEEE style, [1], [2], …, numbered in each tool's `references.json`, in the order first cited.
  - **Reference list:** collapsible on the tool's pages. Each entry has the original link and a link to the archived
    copy in `sources/`.
  - **Archived copies:** kept as files of the repository's `source-archive` release, not in the repository itself,
    so the repository stays small however many sources are added. `sources/archive.json` lists each file with its
    official address, publisher, licence and the SHA-256 checksum of the copy that was checked; a workflow the
    owner runs downloads, checks and uploads them, and records the verified checksums in
    `sources/release-manifest.json`. A file that differs from the checked copy is never accepted. (Older copies
    in `sources/` have their checksums in `sources/manifest.json` and will be moved to the release.)
  - **Uploaded files:** documents the owner uploads are listed in `sources/archive.json`, staged on the temporary
    `source-inbox` branch (deleted by the workflow once they are in the release) and cited the same way.
  - **Blocked downloads:** if a document can't be downloaded automatically, say so and ask the owner to download it.
    Never substitute a guess, and never work around a site's blocks or terms.
  - **Tests:** they fail if a citation is missing from the reference list or a reference has no archived copy.

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
  - The shared look, layout and site pages live in `site/`. Archived sources are shared in `sources/`.
  - Tests check that every tool folder follows the conventions.
  - Per-tool jobs are named `<slug>-*.yml`.

## 10. Open and maintainable

- **Rule:** anyone can see, check and run everything.
- **Why:** transparency is the point; hidden steps can't be checked.
- **In practice:**
  - **Licence and hosting:** the code is MIT-licensed and the site is static, hosted on GitHub Pages.
  - **Data scripts:** they need nothing beyond what's in the repo (Python standard library), and generated files
    are rebuilt from scripts, never edited by hand.
  - **Look and feel:** the theme follows the owner's physicsoffusion.com site (Averia fonts, navy on beige, light
    only) and the logo is the owner's own.
  - **Commits:** they are made in the owner's name (`mehfoos`, using the GitHub no-reply address).

## Decision log

Record significant decisions here (site-wide) or in a tool's `DECISIONS.md` (tool-specific), newest first, with the
reason.

| Date | Decision | Reason |
|---|---|---|
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
