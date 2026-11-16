# Exercise planner: design decisions

Tool-specific intent and decisions, newest first. Site-wide principles are in
[`docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md).

## Intent

Help someone choose a small number of exercises that together work the muscles they care about (or their heart and
lung fitness), at a gym or at home, with whatever equipment they have, and see clearly what else each choice works.
It suggests exercises; it is not a training programme (no loads, repetitions or schedules) and not medical advice.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-11-15 | Muscles that only hold still are listed as "steadied" and not counted, except in hold exercises (plank, carries) | Keeps "direct/indirect" tied to the joint movement, as in Pelland et al.; stated as a limitation |
| 2026-11-15 | Where Pelland et al. Table 1A classifies an exercise, follow it exactly (e.g. rows train the trapezius indirectly); otherwise classify by joint movement and mark "by analogy" | Use the primary source where it exists; be open about judgement elsewhere |
| 2026-11-15 | 13 muscle groups, coarse on purpose (e.g. one "Shoulders" group) | Finer splits would claim more precision than the sources support |
| 2026-11-15 | Search every combination of up to 10 exercises (at most 30 candidates, keeping the best 3 per target), grouping exercises that are identical for the chosen targets; ranked by targets covered, then fewest exercises | Exact and fast (about 0.1 s for a whole-body search with a full gym); the capped score has diminishing returns, so exercises that add nothing can be skipped safely |
| 2026-11-15 | Aerobic intensity from the 2024 Adult Compendium MET values, unchanged, with codes; WHO 2020 bands (moderate 3–<6, vigorous ≥6 MET) | Measured values from the standard reference; the Compendium asks that values not be altered |
| 2026-11-16 | Cite the WHO 2020 guidelines document itself (owner-supplied copy), keeping the BJSM paper as a second archived copy | Primary source; the WHO PDF couldn't be downloaded automatically |
| 2026-11-16 | Check against the published Pelland et al. article but archive only the preprint | The published version is under exclusive licence to Springer Nature, so it can't be redistributed in a public repository |
| 2026-11-15 | WHO 2020 guidelines cited through their open-access BJSM paper (Bull et al. 2020) | Superseded on 2026-11-16 (above) |
| 2026-11-15 | Fractional set counting: direct 1, indirect 0.5 (Pelland et al. 2026) | Best-supported method in the largest dose-response analysis; Schoenfeld et al. (2019) noted 1:1 can't be assumed |
| 2026-11-15 | Released as alpha | Exercises classified by analogy are not yet compared with muscle-activity (EMG) reviews |

## Possible next steps

- Compare each "by analogy" exercise with systematic reviews of muscle activity (EMG), e.g. gluteus maximus
  (Neto et al. 2020, J Sports Sci Med), deadlift variants (Martín-Fuentes et al. 2020, PLOS ONE), core exercises
  (Oliva-Lozano and Muyor 2020, IJERPH), and record the outcome.
- Optional weekly plan: sets per week per muscle against the dose-response curves, if it can be done without overclaiming.
