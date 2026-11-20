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
| 2026-11-19 | Owner approved every recommendation in the 19 Nov review (project doc `claude/exercise-planner-review.md`): only continuous, rhythmic activities count for heart and lungs; split the shoulders into front, side and rear if the sources support it; keep the planner's own classifications, labelled as assumptions; bodyweight exercises become a separate option, on by default; state the WHO 18–64 scope for now, older adults later | Accuracy first; done in phases, one at a time |
| 2026-11-19 | Nothing is chosen when the page opens (no targets, no equipment); the visitor picks both | Owner's decision |
| 2026-11-19 | Where each muscle's classification comes from is recorded per muscle (`sources`), not per exercise; only exact Table 1A names count; everything else is marked ◇ with an "Assumption" caveat | The old per-exercise `listed` flag hid that, e.g., the lat pulldown's lats aren't in the table, and three table names had been invented |
| 2026-11-19 | Where the planner uses a Table 1A exercise, it also follows the table for every other muscle that row covers (so the machine/cable fly no longer counts the shoulders; squats, lunges and the leg press don't count the hamstrings); lunge split into bodyweight and dumbbell versions | Never contradict the source for an exercise it classifies |
| 2026-11-19 | An exercise group can be used once per different member, so a muscle can reach 2 or 3 sets (and two indirect exercises can add up to one set); the search stops after 400,000 steps and says so | Before, a higher "covered" level was unreachable because each group of equivalent exercises was used only once |
| 2026-11-19 | When "All different" can't be met, the shared-exercise limit is loosened 10% at a time (not straight to "any"), and the page reports the share actually used and any exercise in every suggestion | The old fallback produced near-copies (9 of 10 exercises shared) |
| 2026-11-19 | "Include bodyweight exercises" is a separate option, on by default; presets no longer decide it (only "No equipment" switches it on); invalid settings are brought into range | Machines-only and free-weights-only presets silently excluded all bodyweight exercises (owner approved) |
| 2026-11-20 | Only continuous, rhythmic activities count towards heart and lungs; kettlebell swings and burpees become "intervals" (value shown, not counted) | WHO 2020 glossary: aerobic = rhythmic "for a sustained period", anaerobic = "brief intense bursts" (owner approved) |
| 2026-11-20 | WHO wording: "at least", 18–64 scope, "moderate or greater intensity" for strengthening, relative 0–10 scale, the 65+ addition; intensity band shown per Compendium row | Match the source's wording; the old "about … meets" overstated it |
| 2026-11-20 | State the Compendium's scope (19–59, no disability or significant health condition) and that none of the 17 values used is an estimate; age choice not added yet | Checked on pacompendium.com (estimates in red); older adults need the separate Older Adult Compendium (owner: scope only for now) |
| 2026-11-20 | Shoulders split into front, side and rear deltoid (15 muscle groups); old `t=shoulders` links choose all three; Table 1A's anterior-deltoid row credits the front only; barbell front raise added (in Table 1A); overhead presses count the side indirectly and rows the rear indirectly (assumptions from the parts' actions in Stokey et al. 2024) | One group called the shoulders "covered" by a face pull alone (owner approved; OpenStax treats the deltoid as one muscle; Stokey et al. 2024 and StatPearls NBK536933 agree on the parts' actions) |
| 2026-11-20 | Horizontal abduction (face pull, band pull-apart) credited to the rear deltoid as the planner's reading, not a sourced action | None of Stokey et al. 2024, OpenStax or StatPearls names the muscles of horizontal abduction |
| 2026-11-20 | Results with bodyweight-only strength exercises carry a note that they may count for less than shown | The studies controlled load and proximity to failure (A11) |
| 2026-11-20 | New sources registered in `sources/archive.json` (inserted in place, no existing line changed) before the merge | The site's tests require every cited asset to be registered; a merge conflict there is additions only |
| 2026-11-20 | New status † ("supported by growth studies", field `evidence`) between Table 1A and ◇: glutes in the back squat, leg press, hip thrust and bodyweight squat | Krause Neto et al. 2025 (systematic review, 12 studies) and Plotkin et al. 2023 (RCT, MRI); supports counting the muscle, not the full-or-half level |
| 2026-11-20 | Hamstrings no longer counted for the hip thrust or glute bridge; back squat described as to parallel or lower | Plotkin et al. 2023: little to no hamstring growth with hip thrusts or squats; squats to 90° grew the glutes less or not significantly (Kubo 2019, Nakamura 2021, via Krause Neto 2025) |
| 2026-11-20 | Deadlift, RDL, single-leg RDL, kettlebell swing, lunge, goblet squat, back extension: glutes stay ◇ | No study in the review isolated them (only combined programmes) |
| 2026-11-19 | Work on the planner happens on its own branch and touches only `tools/exercise-planner/` | Other sessions are working on other tools at the same time |
| 2026-11-15 | Muscles that only hold still are listed as "steadied" and not counted, except in hold exercises (plank, carries) | Keeps "direct/indirect" tied to the joint movement, as in Pelland et al.; stated as a limitation |
| 2026-11-15 | Where Pelland et al. Table 1A classifies an exercise, follow it exactly; otherwise classify by joint movement and mark "by analogy" | Superseded on 2026-11-19 (per-muscle sources, above) |
| 2026-11-15 | 13 muscle groups, coarse on purpose (e.g. one "Shoulders" group) | Finer splits would claim more precision than the sources support |
| 2026-11-15 | Search every combination of up to 10 exercises (at most 30 candidates, keeping the best 3 per target), grouping exercises that are identical for the chosen targets; ranked by targets covered, then fewest exercises | Exact and fast (about 0.1 s for a whole-body search with a full gym); the capped score has diminishing returns, so exercises that add nothing can be skipped safely |
| 2026-11-15 | Aerobic intensity from the 2024 Adult Compendium MET values, unchanged, with codes; WHO 2020 bands (moderate 3–<6, vigorous ≥6 MET) | Measured values from the standard reference; the Compendium asks that values not be altered |
| 2026-11-16 | Cite the WHO 2020 guidelines document itself (owner-supplied copy), keeping the BJSM paper as a second archived copy | Primary source; the WHO PDF couldn't be downloaded automatically |
| 2026-11-16 | Check against the published Pelland et al. article but archive only the preprint | The published version is under exclusive licence to Springer Nature, so it can't be redistributed in a public repository |
| 2026-11-15 | WHO 2020 guidelines cited through their open-access BJSM paper (Bull et al. 2020) | Superseded on 2026-11-16 (above) |
| 2026-11-15 | Fractional set counting: direct 1, indirect 0.5 (Pelland et al. 2026) | Best-supported method in the largest dose-response analysis; Schoenfeld et al. (2019) noted 1:1 can't be assumed |
| 2026-11-15 | Released as alpha | Exercises classified by analogy are not yet compared with muscle-activity (EMG) reviews |

## Possible next steps

- **Hamstrings evidence found but not yet used (20 Nov 2026), pending the owner's decision on sources that can't be
  redistributed:** Morin et al. 2025 (J Strength Cond Res 39(9):924–932; preprint medRxiv 10.1101/2024.12.17.24319207,
  "cc_no" licence): 9 weeks of stiff-leg deadlifts (hip flexion 0–90°, knees slightly unlocked) grew the whole
  hamstrings by 7.0 ± 8.1% vs control (p = 0.044), mostly the semimembranosus; supports the Romanian deadlift.
  Bourne et al. 2017 (Br J Sports Med 51:469–477; accepted manuscript at Griffith, "no further distribution"): 10 weeks
  of 45° hip extension increased biceps femoris long head, semitendinosus and semimembranosus volume vs control (MRI);
  supports the back extension. Crawford et al. 2025 (MSSE, RDL vs Nordic, 6 weeks) not yet read (paywalled).

- Compare each "by analogy" exercise with systematic reviews of muscle activity (EMG), e.g. gluteus maximus
  (Neto et al. 2020, J Sports Sci Med), deadlift variants (Martín-Fuentes et al. 2020, PLOS ONE), core exercises
  (Oliva-Lozano and Muyor 2020, IJERPH), and record the outcome.
- Optional weekly plan: sets per week per muscle against the dose-response curves, if it can be done without overclaiming.
