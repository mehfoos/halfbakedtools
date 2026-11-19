# Exercise planner

Suggests a few short lists of exercises that cover the muscle groups (and heart and lung fitness) a visitor chooses,
using only the equipment they have, with charts of what each list works. Live at
https://halfbakedtools.com/tools/exercise-planner/.

## Files

```
tool.json             name, summary, status, pages
pages/index.astro     the planner
pages/methods.astro   methods, sources, what has been checked, limitations (exercise tables are generated from the catalogue)
web/catalogue.ts      muscle groups, equipment, presets and every exercise: muscles (direct / indirect / steadied),
                      equipment needed, Compendium MET rows; edit exercises here
web/pelland-table-1a.ts  Pelland et al. Table 1A, transcribed exactly: which exercises the study counted as direct or
                      indirect for each muscle it covers
web/planner.ts        pure planning code: equipment filter, fractional-set counting, search, varied suggestions
web/chart.ts          SVG radar and bar charts (pure)
web/ui.ts             page behaviour; settings live in the page address
web/planner.test.ts   tests (run with npm test from the repository root)
references.json       references, in citation order
DECISIONS.md          intent and design decisions
VERIFICATION.md       what was checked against which archived document, and when
```

## Adding or changing an exercise

1. Add it to `EXERCISES` in `web/catalogue.ts` with the joint movements it loads (`moves`).
2. For each muscle, check `web/pelland-table-1a.ts` (Pelland et al. 2026, Table 1A). If the table classifies this
   exercise for that muscle, follow it exactly and add `sources: { muscle: "Name exactly as printed" }`. Never adapt or
   invent a table name (e.g. "dumbbell variant"): if the exact exercise isn't in the table, it isn't sourced.
3. Every other muscle is the planner's own assumption: assign it from the movements, using the OpenStax muscle
   tables, and leave it out of `sources`. The site then marks it ◇ with an "Assumption" caveat. The tests check
   every `sources` entry against the table.
4. For aerobic activities, copy the Compendium row(s) exactly (code, MET, description). Don't adjust MET values.
5. Record the check in `VERIFICATION.md`, then run `npm test`.
