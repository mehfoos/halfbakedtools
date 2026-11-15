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
2. If Pelland et al. (2026) Table 1A classifies it, follow that table and set `listed` to the name used there.
   Otherwise assign muscles from the movements, using the OpenStax muscle tables, and leave `listed` unset (the site
   then marks it "by analogy").
3. For aerobic activities, copy the Compendium row(s) exactly (code, MET, description). Don't adjust MET values.
4. Record the check in `VERIFICATION.md`, then run `npm test`.
