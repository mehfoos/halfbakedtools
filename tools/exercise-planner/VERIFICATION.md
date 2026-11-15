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
| Exercises classified by analogy (no `listed` name) | Not yet checked | Muscle-activity (EMG) systematic reviews still to be compared | – |

## Notes

- The rendered PDFs of the OpenStax pages have a cookie banner covering the bottom of each page, hiding a few table
  rows (e.g. part of the hamstring rows). The raw `.html` copies archived beside them contain the full text.
- The Pelland et al. archived copy is the preprint (version 2); the published *Sports Medicine* version may differ in
  wording. Table 1A and section 2.4 were checked in the preprint.
