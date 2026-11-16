# Verification log

Every number or classification the tool relies on, what it was checked against (archived copies in
[`sources/`](../../sources/), with checksums in `sources/manifest.json`), and when.

| Item | Status | Checked against | Date |
|---|---|---|---|
| All 17 Compendium rows used (code, MET, description) in `web/catalogue.ts` | Checked | `compendium-2024-adult-activity-list.pdf` (text extracted and each code matched) | 15 Nov 2026 |
| Fractional counting (indirect × 0.5 + direct) and the definitions of direct and indirect | Checked | `pelland-2024-dose-response-preprint-v2.pdf`, section 2.4 | 15 Nov 2026 |
| Exercises marked `listed` follow Table 1A (quadriceps, hamstrings, chest, front deltoid, trapezius, triceps, biceps) | Checked | `pelland-2024-dose-response-preprint-v2.pdf`, Table 1A (PDF page 8) | 15 Nov 2026 |
| Participants' average age (≈25) and intervention length (≈10 weeks) quoted as a limitation | Checked | `pelland-2024-dose-response-preprint-v2.pdf`, section 4.3 | 15 Nov 2026 |
| Hamstrings much less active than quadriceps in squats and leg press; 1:1 can't be assumed; advice at the time to count 1:1 | Checked | `schoenfeld-2019-set-volume-multi-joint.pdf`, abstract and conclusions | 15 Nov 2026 |
| WHO adult recommendations (150–300 min moderate or 75–150 min vigorous; muscle-strengthening, all major muscle groups, ≥2 days a week) | Checked | `bull-2020-who-physical-activity-guidelines.pdf`, recommendations for adults (journal p. 1456) | 15 Nov 2026 |
| WHO intensity definitions (moderate 3 to <6 METs; vigorous ≥6 METs) | Checked | `bull-2020-who-physical-activity-guidelines.pdf`, Table 1 glossary (p. 1452) | 15 Nov 2026 |
| Compendium covers adults 19–59 | Checked | `herrmann-2024-adult-compendium.pdf`, abstract | 15 Nov 2026 |
| Muscle actions: gluteus maximus, quadriceps, hamstrings, gastrocnemius, soleus | Checked | `openstax-ap2e-11-6-lower-limbs.pdf`, tables under Figures 11.30, 11.31, 11.33 | 15 Nov 2026 |
| Muscle actions: pectoralis major, latissimus dorsi, deltoid, trapezius, rhomboids, biceps, brachialis, brachioradialis, triceps | Checked | `openstax-ap2e-11-5-upper-limbs.pdf`, Table 11.8 and tables under Figures 11.24, 11.26 | 15 Nov 2026 |
| Muscle actions: rectus abdominis, obliques (Table 11.6); erector spinae (text) | Checked | `openstax-ap2e-11-4-abdomen-thorax.pdf`, `openstax-ap2e-11-3-head-neck-back.pdf` | 15 Nov 2026 |
| Fractional method, definitions, Table 1 classifications (all `listed` exercises), participants (67 studies, 2058 people, mean age 25.16) and mean intervention 10.42 weeks: same in the published version | Checked | Published article, *Sports Medicine* (owner-supplied; not stored, see notes): abstract, section 2, Table 1 | 16 Nov 2026 |
| WHO adult recommendations (150–300 min moderate or 75–150 min vigorous; muscle-strengthening, all major muscle groups, ≥2 days a week) | Checked | `who-2020-guidelines-physical-activity-sedentary-behaviour.pdf`, adults 18–64 (PDF page 12) | 16 Nov 2026 |
| WHO intensity definitions (moderate: 3 to less than 6 times rest; vigorous: 6.0 or more METs; 1 MET = seated at rest) | Checked | `who-2020-guidelines-physical-activity-sedentary-behaviour.pdf`, glossary (PDF page 9) | 16 Nov 2026 |
| Hamstring muscle actions (biceps femoris, semitendinosus, semimembranosus: knee flexion, hip extension), previously hidden by a cookie banner | Checked | `openstax-ap2e-11-6-owner-saved.mht`, description of the table under Figure 11.31 | 16 Nov 2026 |
| Exercises classified by analogy (no `listed` name) | Not yet checked | Muscle-activity (EMG) systematic reviews still to be compared | – |

## Notes

- The rendered PDFs of the OpenStax pages have a cookie banner covering the bottom of each page, hiding a few table
  rows (e.g. part of the hamstring rows). The raw `.html` copies archived beside them contain the full text, and the
  owner-saved `.mht` copies have no banner. The `.mht` copies lack the table images (they weren't loaded when saved),
  but OpenStax's text description of each table is included.
- The Pelland et al. archived copy is the preprint (version 2). The owner supplied the published *Sports Medicine*
  article on 16 Nov 2026 and it was checked, but it is published "under exclusive licence to Springer Nature", so it is
  not stored in this public repository. Its Table 1 matches the preprint's Table 1A for every exercise the tool uses.
