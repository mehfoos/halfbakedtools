# Independent review of the Blended table, 19 Nov 2026

A separate agent reviewed the blend at commit bad897b without seeing how the groups were built (automated, without manual human verification). Its report is kept below as written. Outcome, applied in the next commit: all 13 WRONG and 15 of 18 DOUBTFUL groups are now separated by tested rules (`test_blend_all.py`, class GroupWide); undetected copies counted twice went from 63 pairs to 0 by the reviewer's own check. Still together, because names and values cannot settle them: chicory (AFCD, Frida), apple nectar (BLS, KFCDb) and wild garlic (BLS, KFCDb).

---

## Independent review of the Blended (beta) food table

Reviewer: automated independent check (Claude), 2026-11-19. Read-only on the repository. Scripts, data copies and raw outputs are in `/home/claude/review/`.

**Version reviewed.** This review covers the committed data at `bad897b` ("Blended (beta) from all ten tables, as its own table; tighter matching", generated 2026-11-19, 556 blended foods). It was extracted to `review/head/`. During the review, the working-tree files were regenerated at 07:59 UTC (559 foods; copy in `review/snapshot/`). The differences are listed in section 7; none of them changes a verdict below.

## 1. Summary

| Stratum | Groups | Reviewed | SAME | DOUBTFUL | WRONG |
|---|---|---|---|---|---|
| 5 or more records (all) | 107 | 107 | 99 | 3 | 5 |
| Value-divergent, fewer than 5 records (all) | 259 | 259 | 238 | 13 | 8 |
| Random sample of the remaining 190 (seed 2026) | 190 | 40 | 38 | 2 | 0 |
| **Total** | **556** | **406** | **375** | **18** | **13** |

"Value-divergent" means that, across the used records, protein, fat or energy differ by more than 25%, or vitamin C, sugars, sodium or calcium differ more than three-fold. Floors were applied so that values such as 0.1 g against 0.2 g fat, or 0 against under 1 mg vitamin C, do not count. 354 groups met this test, 95 of them also in the 5+ stratum. With these criteria, 64% of all groups are "divergent", mostly because of energy and carbohydrate definitions and natural variation in sodium and vitamin C. So divergence alone is a weak signal.

**Error rates.**
- **Among the 406 reviewed groups:** 13 WRONG (3.2%) and 31 WRONG or DOUBTFUL (7.6%).
- **All 556 groups, stratified estimate.** The 366 groups in the first two strata were reviewed in full. The random stratum gives 0/40 WRONG (95% Wilson upper bound 8.8%) and 2/40 DOUBTFUL.
  - About **2.3% WRONG** (13 of 556). The 95% upper bound is about 5% (up to about 30 groups).
  - About **6.9% WRONG or DOUBTFUL** (about 38 of 556).
- The errors cluster in identifiable patterns, each fixable by a general rule:
  - salt status: 4 WRONG;
  - fortification: 2 WRONG;
  - peel or skin: 1 WRONG, 1 DOUBTFUL;
  - canned vs boiled, and packing medium: 2 WRONG, 2 DOUBTFUL;
  - cooking method: 1 WRONG, 2 DOUBTFUL;
  - flour grade: 2 WRONG, 1 DOUBTFUL;
  - species or qualifier words: 1 WRONG, 3 DOUBTFUL;
  - other (formulation, fat level, salt by value, fresh vs dried pasta, ambiguous plant name, added vitamin C): 9 DOUBTFUL.

**Larger counting problem (not a grouping error).** 57 groups (10% of all groups) contain at least one *used* record that is a near-copy of another used record: 63 pairs. Mostly these are Ciqual, Frida or Fineli records that reuse USDA values, or BLS records that reuse CoFID values. The effect is that one source is counted twice, and in Quinoa (uncooked), Pecans and Carambola, three times. See section 4.

**Values.** 20 of 20 spot-checked medians are correct for the definition named in `d` (section 5). The arithmetic and the definition separation are sound. The problems are in group membership and copy detection.

## 2. Root causes (after reading the code, `pipeline/blend/blend_all.py` and `pipeline/tables/common_list.py`)

1. **Transitive linking (union-find).** In `groups()`, A~B and B~C put A, B and C in one group, even when A and C fail `ok()` directly. `facet_ok()` treats an unstated skin or salt facet as compatible with either value, so a record with a neutral name joins "salted" to "unsalted", or "with skin" to "without skin". Examples:
   - pistachios: USDA "without salt" ~ BLS "roasted" ~ Fineli "salt";
   - apples: CoFID "flesh and skin" ~ Frida/BLS "Apple raw" ~ CNF/MEXT "without skin";
   - peanuts, butter and mung beans follow the same pattern.

   **Fix:** after grouping, require every pair of members to pass the facet tests (salt, skin, packing medium, fortification, cooking-method class). If they don't, split the group, or drop the members that conflict with the record that names the group. The protein and fat median filter already runs at this stage; add the facet tests next to it.
2. **Facet regexes miss common wordings.**
   - `SALT_YES` does not match Fineli's ", salt" ("Nut, pistachio nut, salt"). `SALT_NO`/`SALT_YES` do not handle "reduced salt".
   - Canned-vs-dried preparation: "canned" groups with "dried, boiled" when one side's packing is unstated.
3. **Fortification is detected only from names.** CNF milks, flours and breads are fortified by regulation without saying so in the name. Their notes say "USDA value changed to meet Canadian regulations" or show the values. Use that note (`q` labels) or a value test: iron or thiamin more than 2.5x, or vitamin D present in fluid milk.
4. **`cl.copies()` is too strict.** It requires 90% of BASE_KEYS within 1%. The keys compared include energy, carbohydrate and fibre, which borrowing tables recompute under their own definitions. So true copies score 75-95% and slip through. **Fix:** compare only directly measured, definition-independent nutrients, and use a threshold of about 75%. The cut used in section 4 is at least 70% within 2% over at least 8 non-zero shared values.
5. **The two-record "median" is a mean.** 263 of 556 groups (47%) have only two records. When the two values contradict each other (sodium 2 vs 232), the published point value is a midpoint that matches neither table (mung beans: sodium 117 mg). The `two-fold` caveat is shown, but the number is still used.

## 3. DOUBTFUL and WRONG groups

Members are listed in table order; "(not used)" marks records shown but not used in the median.

### WRONG (13)

| Blended id | Members (table code "name") | Reason | Suggested general rule |
|---|---|---|---|
| `blend:afcd-f001972` "Butter, plain, reduced salt" | AFCD F001972 "Butter, plain, reduced salt"; Fineli 500 "Butter"; KFCDb N0080000009a "Butter" | Reduced-salt butter (AFCD Na 350) blended with ordinary salted butter (Fineli Na 592) and unsalted butter (KFCDb Na 10); the salt level is what defines these foods. | Treat salt words (salted / unsalted / reduced salt / with salt / without salt) as part of the food identity; never group records whose salt words conflict, and when one name says nothing, require sodium within 2x. |
| `blend:afcd-f002882` "Chickpea, dried, boiled, drained" | AFCD F002882 "Chickpea, dried, boiled, drained"; Frida 1812 "Chickpeas, boiled, canned" | AFCD dried chickpeas boiled (Na 4) vs Frida canned chickpeas (Na 155); sodium median 79.5 matches neither. | Canned vs boiled-from-dried are different foods; a "canned" record must only join "canned" records. |
| `blend:bls-f119902` "Apple unsweetened, canned, drained" | BLS F119902 "Apple unsweetened, canned, drained"; KFCDb H050000000Ra "Apple, Canned"; MEXT 07153 "Apple, canned" | BLS apple unsweetened canned, drained (36 kcal) vs MEXT canned apple (81 kcal; Japanese canned fruit is in syrup) and KFCDb canned apple (66 kcal). | A canned fruit named unsweetened or in juice must not join a canned fruit whose packing medium is unstated, unless sugars or energy agree within about 25%. |
| `blend:apple` "Apples (with skin)" | CoFID 14-319 "Apples, eating, raw, flesh and skin"; CNF 1697 "Apple, raw, without skin"; Frida 2 "Apple, raw, all varieties"; BLS F110100 "Apple raw"; MEXT 07148 "Apple, without skin, raw" | The blend is named "Apples (with skin)", but CNF 1697 and MEXT 07148 are "without skin" (CoFID is with skin; Frida and BLS do not say). | Peel words (with skin / unpeeled / flesh and skin vs without skin / peeled / flesh only) are part of the food identity; check every member against the blended name. |
| `blend:peanuts` "Peanuts (dry roasted, unsalted)" | USDA 173806 "Peanuts, all types, dry-roasted, without salt"; CoFID 14-878 "Peanuts, dry roasted"; BLS H110600 "Peanut roasted"; KFCDb E0070000009n "Peanut(Arachis hypogaea), Roasted" | The blend is "dry roasted, unsalted", but CoFID 14-878 "Peanuts, dry roasted" has Na 790 (salted). The sodium median stays low, but the grouping is wrong. | Same salt rule as above, plus a value check: sodium more than 10x the group median means a salted product. |
| `blend:u170185` "Pistachio nuts, dry roasted, without salt added" | USDA 170185 "Nuts, pistachio nuts, dry roasted, without salt added"; CNF 2588 "Nuts, pistachio nuts, dry roasted" (not used); Frida 757 "Pistachio nuts, dry roasted with salt"; Fineli 33131 "Nut, pistachio nut, salt"; BLS H250600 "Pistachio nut roasted without fat"; KFCDb E0320000009n "Pistachio nut(Pistacia vera L.), Roasted" | The blend is "dry roasted, without salt added", but Frida 757 is "with salt" and Fineli 33131 is "Nut, pistachio nut, salt" (Na 465). | Salt rule above. |
| `blend:u174257` "Mung beans, mature seeds, cooked, boiled, without salt" | USDA 174257 "Mung beans, mature seeds, cooked, boiled, without salt"; Fineli 31213 "Bean, mung bean, boiled, with salt"; BLS H770132 "Mung bean mature, boiled" | The blend is "boiled, without salt", but Fineli 31213 is "boiled, with salt" (Na 232). The blended sodium is 117 mg, a median of two (USDA 2, Fineli 232); the correct value is about 2. | Salt rule above; also never let a 2-record median sit halfway between values more than 10x apart (report a range or drop the outlier). |
| `blend:u172816` "Bread, pita, white, unenriched" | USDA 172816 "Bread, pita, white, unenriched"; CNF 3708 "Bread, pita, white" | The blend is "Bread, pita, white, unenriched", but the CNF pita is enriched (Canadian flour is fortified): iron 4.18 vs 1.4, folate DFE 201 vs 24, thiamin 0.77 vs 0.27. The blend gives iron 2.79 and folate 113. | Treat enriched or fortified status as identity; Canadian CNF cereal and flour products and milks are fortified by regulation unless named "unenriched"; never pair "unenriched" with a record that lacks that word unless iron and thiamin agree within 1.5x. |
| `blend:skimmed-milk` "Skimmed milk" | USDA 173432 "Milk, nonfat, fluid, without added vitamin A and vitamin D (fat free or skim)"; AFCD F005637 "Milk, cow, fluid, skim (~0.15% fat)"; CNF 114 "Milk, fluid, skim, 0.1% M.F."; Frida 1066 "Milk, skimmed, 0.5 % fat"; Fineli 29211 "Milk, 0% fat, without added vitamin d, organic" | USDA is "without added vitamin A and vitamin D", but CNF skim milk is fortified (vitamin D 2.07 ug, retinol 63 ug, "changed to meet Canadian regulations"). The blended vitamin D of 1.04 ug is the midpoint of fortified and unfortified milk. | Fortification rule as above; CNF records whose note says "changed to meet Canadian regulations" are fortified and must not join an unfortified group. |
| `blend:u168462` "Spinach, raw" | USDA 168462 "Spinach, raw"; AFCD F008763 "Spinach, water, fresh, raw"; CNF 2213 "Spinach, raw" (not used); Ciqual 20059 "Spinach, raw"; Frida 50 "Spinach, raw"; Fineli 33456 "Spinach"; BLS G211100 "Spinach raw"; KFCDb F1150000000a "Spinach, Raw" | AFCD F008763 "Spinach, water, fresh, raw" is water spinach (kangkong, Ipomoea aquatica), a different species from spinach (Spinacia oleracea). | A word that qualifies the food ("water spinach", "New Zealand spinach") must not be dropped in matching; compare head-noun phrases, not single words. |
| `blend:u169229` "Aubergine, cooked, boiled, drained, without salt" | USDA 169229 "Eggplant, cooked, boiled, drained, without salt"; CoFID 13-651 "Aubergine, flesh and skin, boiled in unsalted water"; AFCD F003753 "Eggplant, unpeeled, fresh, roasted, no added fat"; CNF 2089 "Eggplant (aubergine, brinjal), boiled, drained" (not used); Ciqual 20002 "Eggplant, cooked"; BLS G510132 "Aubergine boiled"; KFCDb F0030000009c "Eggplant(Solanum melongena L.), Blanched" | The blend is "Aubergine, boiled, drained", but AFCD F003753 is "Eggplant, unpeeled, fresh, roasted" (dry heat vs boiling in water). | Cooking method classes (boiled/steamed/blanched vs roasted/baked/grilled vs fried) must agree; boiled and roasted are not interchangeable. |
| `blend:ciqual-9415` "Wheat flour, type 150" | Ciqual 9415 "Wheat flour, type 150"; BLS C213200 "Wheat flour, Type 1050" | French flour type 150 (wholemeal, ash about 1.5%, fibre 10.2) vs German Type 1050 (medium flour, fibre 6.4). | Flour type numbers are part of the identity, and French and German scales differ (FR T55 = DE 550, FR T150 = wholemeal); match on extraction or ash, not on the word "flour". |
| `blend:cofid-11-897` "Flour, rye" | CoFID 11-897 "Flour, rye"; CNF 4431 "Grains, rye flour, light"; Ciqual 9533 "Rye flour, type 130"; BLS C223600 "Rye flour, Type 1740" | Rye flours of different extraction: CNF "light" (fibre 14.6 by AOAC), Ciqual type 130 (fibre 9.5), BLS Type 1740 (dark, fibre 18.7), CoFID unspecified (and, in the working-tree version, MEXT rye flour too). | Flour grade rule above; "light"/"dark"/type numbers must agree. |

### DOUBTFUL (18)

| Blended id | Members (table code "name") | Reason | Suggested general rule |
|---|---|---|---|
| `blend:afcd-f001548` "Bread, organic, toasted" | AFCD F001548 "Bread, organic, toasted"; CNF 7313 "Bread, made with milk, commercial, toasted" | AFCD "Bread, organic, toasted" (type unstated; fibre 6.6) vs CNF "Bread, made with milk, commercial, toasted" (fibre 3.7, calcium 117 vs 56). | For breads, require the same flour type (white/wholemeal/mixed grain) and the same added-milk status; "organic" is not a bread type. |
| `blend:afcd-f002884` "Chicory, raw" | AFCD F002884 "Chicory, raw"; Frida 544 "Chicory, raw" | AFCD "Chicory" (vitamin A 42, iron 1.7: a leafy chicory) vs Frida "Chicory" (vitamin A 2.5: probably witloof or Belgian endive). | Ambiguous plant names (chicory, endive, yam, squash) need a cultivar or form word or a value check (vitamin A, iron) before grouping. |
| `blend:bls-f110700` "Apple nectar" | BLS F110700 "Apple nectar"; KFCDb H0510000009a "Apple, Nectar" | Apple nectar: KFCDb has vitamin C 25 mg and iron 2.4 mg (vitamin C probably added), while BLS has vitamin C 0. | Juices and nectars: treat added vitamin C as fortification; when vitamin C differs more than 5x, do not blend vitamin C. |
| `blend:bls-g492100` "Wild garlic raw" | BLS G492100 "Wild garlic raw"; KFCDb F0390000000a "Wild garlic(Allium monanthum), Raw" | BLS wild garlic (ramsons, Allium ursinum) vs KFCDb Allium monanthum, a different species. | When a table gives a Latin binomial, it must agree with the other members' species (or the group must be marked as a species proxy). |
| `blend:afcd-f007641` "Rice, brown, boiled, no added salt" | AFCD F007641 "Rice, brown, boiled, no added salt"; BLS C351082 "Brown rice boiled, fried without fat (pan)" | AFCD brown rice "boiled, no added salt" vs BLS "Brown rice boiled, fried without fat (pan)": a two-step preparation, 137 vs 166 kcal. | A record naming two cooking steps must only join records with the same steps. |
| `blend:ciqual-20011` "Mushroom, all types, canned, drained" | Ciqual 20011 "Mushroom, all types, canned, drained"; Frida 927 "Mushroom, canned" | Ciqual canned mushrooms, drained (Na 425) vs Frida canned mushrooms (Na 5, probably raw-derived). The sodium median of 215 matches neither. | Value check: for canned vegetables, sodium more than 10x apart means different products or salt; do not blend sodium. |
| `blend:ciqual-20048` "Tomato, peeled, canned, drained" | Ciqual 20048 "Tomato, peeled, canned, drained"; Frida 596 "Tomato, peeled, canned"; BLS G560900 "Tomato canned"; KFCDb F186000000Ra "Tomato, Canned" | Canned tomatoes: KFCDb Na 4 (no added salt) vs Ciqual, Frida and BLS Na 86-143 (salted). | Salt and value check as above. |
| `blend:ciqual-9436` "Wheat flour, type 55 (for bread)" | Ciqual 9436 "Wheat flour, type 55 (for bread)"; BLS C214100 "Wheat flour, Type 405" | French T55 bread flour is equivalent to German Type 550, not Type 405 (calcium 23 vs 10.8, iron 1.0 vs 0.65). | Flour grade rule. |
| `blend:cofid-11-450` "Pasta, plain, fresh, boiled" | CoFID 11-450 "Pasta, plain, fresh, boiled"; CNF 4469 "Pasta (spaghetti macaroni), unenriched, cooked"; Ciqual 9811 "Pasta, dry, regular, cooked, no added salt" | CoFID fresh pasta, boiled (often egg pasta; calcium 37, fat 1.5) vs CNF and Ciqual dried pasta, cooked. | Fresh vs dried pasta (and egg vs plain) are different foods. |
| `blend:cofid-11-745` "Breakfast cereal, cornflakes, unfortified" | CoFID 11-745 "Breakfast cereal, cornflakes, unfortified"; BLS C515400 "Cornflakes unsweetened" | CoFID unfortified cornflakes (Na 410, sugars 3) vs BLS "Cornflakes unsweetened" (Na 59, sugars 0.7): different formulations. | For processed cereals, require sodium and sugars within 2x, or keep the national products apart. |
| `blend:cnf-28` "Cheese, cream cheese product, plain" | CNF 28 "Cheese, cream cheese product, plain"; Frida 1773 "Cheese, Cream, 45-55 % fidm." | CNF "cream cheese product" (a Canadian regulatory category distinct from cream cheese) vs Frida cream cheese 45-55% fidm. | Words such as "product", "spread", "imitation" or "analogue" are identity words. |
| `blend:frida-1044` "Margarine, (more than 50 % fat), average" | Frida 1044 "Margarine, (more than 50 % fat), average"; KFCDb N0060000009a "Margarine" | Frida margarine >50% fat, average (82.4 g fat) vs KFCDb margarine (72.4 g fat, 12 g carbohydrate): different fat levels. | Fat-level words or percentages must agree within about 10%, and fat must agree when both tables give it. |
| `blend:haricot` "Haricot beans (cooked)" | USDA 173746 "Beans, navy, mature seeds, cooked, boiled, without salt"; CoFID 13-665 "Beans, haricot, canned, re-heated, drained"; AFCD F000437 "Bean, haricot, dried, boiled, drained"; CNF 3384 "Beans, navy, mature seeds, boiled" (not used); BLS H740132 "Haricot bean mature, boiled" | CoFID 13-665 is "canned, re-heated, drained"; the others are boiled from dried. | Canned rule above. |
| `blend:onion` "Onions (cooked)" | USDA 170001 "Onions, cooked, boiled, drained, without salt"; CoFID 13-589 "Onions, baked"; CNF 2402 "Onion, boiled, drained" (not used); Ciqual 20035 "Onion, cooked"; BLS G480132 "Onion boiled"; KFCDb F1320000009c "Onion, Blanched" | CoFID 13-589 "Onions, baked" in a boiled-onion group (USDA, CNF and BLS boiled, KFCDb blanched, Ciqual "cooked"). | Cooking-method rule. |
| `blend:potato` "Potato (baked, with skin)" | CoFID 13-491 "Potatoes, old, baked, flesh and skin"; CNF 2419 "Potato, flesh, baked"; Ciqual 4026 "Potato, roasted/baked" | The blend is "baked, with skin", but CNF 2419 is "Potato, flesh, baked" (no skin). | Peel rule. |
| `blend:mozzarella` "Mozzarella" | USDA 170845 "Cheese, mozzarella, whole milk"; CoFID 12-360 "Cheese, Mozzarella, fresh"; AFCD F002472 "Cheese, mozzarella"; CNF 35 "Cheese, mozzarella, (48% water, 25% M.F.)" (not used); Fineli 29239 "Cheese, mozzarella cheese, 20% fat" | CoFID "Mozzarella, fresh" (fresh ball, protein 18.6) vs USDA whole-milk and CNF 48%-water low-moisture mozzarella (protein 22). | Fresh vs low-moisture cheese types: require a moisture/type match (or fat and protein within 15%). |
| `blend:u173747` "Haricot beans (navy), mature seeds, canned" | USDA 173747 "Beans, navy, mature seeds, canned"; BLS H740902 "Haricot bean mature, canned, drained" | USDA navy beans "canned" (solids and liquid, Na 336) vs BLS "canned, drained". | Drained vs undrained is part of the identity. |
| `blend:u168590` "Chestnuts, japanese, roasted" | USDA 168590 "Nuts, chestnuts, japanese, roasted"; AFCD F006096 "Nut, chestnut, roasted, unsalted"; CNF 2614 "Nuts, Japanese chestnuts, roasted" (not used) | The blend is "Chestnuts, japanese, roasted" (Castanea crenata), but AFCD "Nut, chestnut, roasted" is presumably the European chestnut (carbohydrate 35.7 vs 45.1). | Species rule: a species word in one name ("japanese") must be matched or the group renamed. |

Notes on judgement:
- Moderate energy or carbohydrate differences were never used on their own as evidence. Steamed vs boiled vegetables, and "blanched" (KFCDb) vs "boiled", were accepted as SAME.
- One correction during the review: the Taro group (CoFID steamed, AFCD "peeled, fresh, boiled, drained") was first misread from truncated output. It is SAME.
- Many SAME groups show natural or analytical spread, for example cucumber fat 0.03-0.6 g, or celery vitamin C 1-10 mg. These are not grouping errors.
- A few source records have implausible values that the median absorbs in groups of 3 or more:
  - KFCDb canned asparagus, iron 12 mg;
  - Frida lemon juice, calcium 110 mg;
  - KFCDb apple nectar, iron 2.4 mg;
  - CNF medium cheddar, iron 1.54 mg and carbohydrate 6.5 g.

## 4. Undetected copies among used records (counted twice)

Method: two *used* records in one group whose directly comparable nutrients (minerals, vitamins, fat, protein, fatty acids and amino acids; energy, carbohydrate, sugars, fibre and the definition-dependent vitamins excluded) agree within 2% on at least 70% of at least 8 shared non-zero values. Script: `review/copies.py`.

Most frequent pairs:

| Pair | Count |
|---|---|
| USDA = Ciqual | 16 |
| USDA = Fineli | 7 |
| USDA = Frida | 7 |
| Ciqual = Frida | 7 |
| CoFID = BLS | 6 |
| CoFID = Ciqual | 4 |

The pipeline does mark the CNF copy of USDA in the same groups, so these groups count USDA twice.

Triple counting: Quinoa uncooked (USDA, Ciqual, Fineli), Pecans (USDA, Ciqual, Fineli), Carambola (USDA, Ciqual, Frida).

Concrete effect: in "Apple, dried", sodium = 87 = the Ciqual and Frida copies (both 87). In "Mung beans, dry", iron = 6.74 = USDA and its Frida copy.

All 63 pairs:

| Blended id | Name | Used records that look like copies | Shared nutrients within 2% |
|---|---|---|---|
| `blend:almonds` | Almonds | USDA 170567 = CoFID 14-896 | 16/19 |
| `blend:pumpkin-seeds` | Pumpkin seeds | USDA 170556 = Ciqual 15064 | 19/21 |
| `blend:courgette` | Courgette (cooked) | CoFID 13-628 = BLS G582132 | 13/16 |
| `blend:leeks` | Leeks (cooked) | CoFID 13-625 = BLS G470132 | 12/17 |
| `blend:beetroot` | Beetroot (cooked) | CoFID 13-633 = BLS G613132 | 13/17 |
| `blend:parsnip` | Parsnips (cooked) | CoFID 13-631 = BLS G640132 | 14/18 |
| `blend:mango` | Mango | USDA 169910 = Fineli 34361 | 20/22 |
| `blend:tempeh` | Tempeh | USDA 174272 = Fineli 31249 | 16/20 |
| `blend:brazil-nuts` | Brazil nuts | USDA 170569 = Fineli 32464 | 19/21 |
| `blend:hemp-seeds` | Hemp seeds (hulled) | USDA 170148 = Ciqual 15063 | 18/19 |
| `blend:salmon` | Salmon (farmed, cooked) | USDA 175168 = Ciqual 26230 | 15/21 |
| `blend:u168155` | Limes, raw | USDA 168155 = Frida 464 | 20/25 |
| `blend:u168163` | Quinces, raw | USDA 168163 = Ciqual 13010 | 17/18 |
| `blend:u168390` | Asparagus, cooked, boiled, drained | CoFID 13-638 = BLS G450142 | 15/18 |
| `blend:u168436` | Mushrooms, shiitake, dried | USDA 168436 = CoFID 13-294 | 11/12 |
| `blend:u168455` | Swede, cooked, boiled, drained, without salt | CoFID 13-650 = BLS G611132 | 13/13 |
| `blend:u168462` | Spinach, raw | USDA 168462 = Ciqual 20059 | 18/22 |
| `blend:u168874` | Quinoa, uncooked | USDA 168874 = Ciqual 9340 | 16/20 |
| `blend:u168874` | Quinoa, uncooked | USDA 168874 = Fineli 31175 | 20/21 |
| `blend:u168874` | Quinoa, uncooked | Ciqual 9340 = Fineli 31175 | 15/19 |
| `blend:u168927` | Pasta, dry, unenriched | USDA 168927 = Ciqual 9810 | 15/21 |
| `blend:u169229` | Aubergine, cooked, boiled, drained, without salt | USDA 169229 = Ciqual 20002 | 15/21 |
| `blend:u169387` | Rocket, raw | USDA 169387 = Fineli 34159 | 16/21 |
| `blend:u169745` | Spelt, uncooked | USDA 169745 = Ciqual 9001 | 18/19 |
| `blend:u169907` | Longans, dried | USDA 169907 = CoFID 14-137 | 13/15 |
| `blend:u169972` | Brussels sprouts, frozen, unprepared | USDA 169972 = Ciqual 20206 | 17/22 |
| `blend:u170182` | Pecans | USDA 170182 = Ciqual 15026 | 19/21 |
| `blend:u170182` | Pecans | USDA 170182 = Fineli 33095 | 20/22 |
| `blend:u170182` | Pecans | Ciqual 15026 = Fineli 33095 | 17/21 |
| `blend:u170284` | Barley, pearled, dry (uncooked weight) | USDA 170284 = Ciqual 9321 | 17/18 |
| `blend:u170427` | Peppers, green, raw | CoFID 13-318 = Fineli 387 | 15/19 |
| `blend:u170428` | Peppers, green, cooked, boiled, drained, without salt | USDA 170428 = Ciqual 20086 | 18/19 |
| `blend:u170571` | Cashew nuts, dry roasted, without salt added | USDA 170571 = Frida 815 | 29/32 |
| `blend:u171283` | Whey, sweet, dried | USDA 171283 = Frida 977 | 26/32 |
| `blend:u171710` | Blackberries, frozen, unsweetened | USDA 171710 = Frida 703 | 18/20 |
| `blend:u171711` | Blueberries, raw | USDA 171711 = Ciqual 13028 | 17/19 |
| `blend:u171715` | Carambola, (starfruit), raw | USDA 171715 = Ciqual 13054 | 17/18 |
| `blend:u171715` | Carambola, (starfruit), raw | USDA 171715 = Frida 579 | 23/28 |
| `blend:u171715` | Carambola, (starfruit), raw | Ciqual 13054 = Frida 579 | 14/17 |
| `blend:u173021` | Figs, raw | USDA 173021 = Frida 578 | 27/32 |
| `blend:u173044` | Guavas, common, raw | USDA 173044 = Ciqual 13083 | 19/22 |
| `blend:u174256` | Mung beans, mature seeds, dry (uncooked weight) | USDA 174256 = Frida 58 | 24/34 |
| `blend:u174665` | Figs, dried, uncooked | USDA 174665 = Fineli 33070 | 19/20 |
| `blend:cofid-13-811` | Chervil, dried | CoFID 13-811 = Ciqual 10999 | 11/13 |
| `blend:cofid-13-818` | Coriander leaves, dried | CoFID 13-818 = Frida 835 | 10/12 |
| `blend:cofid-13-825` | Dill, dried | CoFID 13-825 = Ciqual 11063 | 14/16 |
| `blend:cofid-13-835` | Marjoram, dried | CoFID 13-835 = Ciqual 11034 | 14/16 |
| `blend:cofid-13-852` | Saffron | CoFID 13-852 = Ciqual 11039 | 9/10 |
| `blend:cofid-13-888` | Coriander leaves, fresh | CoFID 13-888 = Frida 867 | 14/18 |
| `blend:cnf-2132` | New Zealand spinach, raw | CNF 2132 = BLS G213100 | 17/19 |
| `blend:cnf-2036` | Cabbage, savoy, raw | CNF 2036 = Frida 752 | 25/32 |
| `blend:cnf-4421` | Grains, oats, dry | CNF 4421 = Ciqual 9310 | 17/18 |
| `blend:ciqual-11026` | Coriander, seed | Ciqual 11026 = Frida 775 | 13/14 |
| `blend:ciqual-11032` | Basil, dried | Ciqual 11032 = Fineli 33433 | 16/19 |
| `blend:ciqual-11042` | Cumin, seed | Ciqual 11042 = Frida 1698 | 18/20 |
| `blend:ciqual-11064` | Caraway, seed | Ciqual 11064 = Frida 1697 | 16/17 |
| `blend:ciqual-11066` | Fennel, seed | Ciqual 11066 = Frida 793 | 12/14 |
| `blend:ciqual-11093` | Dill, fresh | Ciqual 11093 = Frida 22 | 18/22 |
| `blend:ciqual-15029` | Alfalfa seeds, sprouted | Ciqual 15029 = Frida 1111 | 17/20 |
| `blend:cnf-2084` | Cress, garden, raw | CNF 2084 = Ciqual 20199 | 19/20 |
| `blend:cnf-2383` | Carrot, frozen, unprepared | CNF 2383 = Ciqual 20208 | 19/20 |
| `blend:ciqual-27000` | Eel, roasted/baked | Ciqual 27000 = KFCDb K1530040009f | 20/22 |
| `blend:cnf-3327` | Soy protein concentrate (prepared with alcohol) | CNF 3327 = Fineli 11700 | 16/19 |

## 5. Value spot-check (20 values, random, seed 2026)

Sampling: 20 (food, standard, nutrient) cells, drawn from cells with values from at least 3 tables and a non-calculated definition. For each cell, the check took the definition in `d`, read the used tables' values from the `s` text, checked each value against the table's own source file (`foods*.json`, value `v`), and recomputed the median. Script: `review/spot.py`.

**Result: 20/20 medians correct.** Every `s` value equals the source-file value, and records marked "not used" are excluded. Tables that publish the nutrient under another definition are kept apart: in Cashews protein, BLS N×6.25 is not mixed with N×factor.

The arithmetic is right. Two of the spot-checked values are still distorted by undetected copies (rows 13 and 16).

| # | Blended food | Standard, nutrient [definition] | Blend value | Used records (definition, values as in "s" and source files) | Median | Result |
|---|---|---|---|---|---|---|
| 1 | `blend:ciqual-20007` Carrot, canned, drained | us ala [ala] | 0.011 | Ciqual 0.011; Frida 0.01143; BLS 0.00426 | 0.011 | OK |
| 2 | `blend:red-pepper` Red pepper (raw) | uk vitaminD [vitaminD:d2d3] | 0.0 | USDA 0; BLS 0; KFCDb 0 | 0 | OK |
| 3 | `blend:u170886` Yoghurt, plain, low fat | eu manganese [manganese] | 0.004 | USDA 0.004; Frida 0.003; Fineli 0.01 | 0.004 | OK |
| 4 | `blend:u171030` Oil, walnut | uk la [la] | 56.85 | USDA 52.9; Ciqual 56.7; BLS 57; KFCDb 57.45 | 56.85 | OK |
| 5 | `blend:cauliflower` Cauliflower (cooked) | us vitaminK [vitaminK:k1] | 15.85 | USDA 13.8; Ciqual 8.13; BLS 20; KFCDb 17.89 | 15.845 | OK |
| 6 | `blend:frida-1084` Wheat germ, raw | eu fat [fat] | 9.6 | Frida 9.6; Fineli 10; BLS 8.34 | 9.6 | OK |
| 7 | `blend:whole-milk` Whole milk | uk fat [fat] | 3.49 | USDA 3.27; CoFID 3.6; Ciqual 3.49; BLS 3.49 | 3.49 | OK |
| 8 | `blend:u172430` Peanuts, all types, raw | us riboflavin [riboflavin] | 0.1 | USDA 0.135; CoFID 0.1; Ciqual 0.024 | 0.1 | OK |
| 9 | `blend:u169387` Rocket, raw | eu manganese [manganese] | 0.38 | USDA 0.321; CoFID 0.41; AFCD 0.632; Frida 0.4113; Fineli 0.321; BLS 0.35 | 0.38 | OK |
| 10 | `blend:u173750` Beans, small white, mature seeds, cooked, boiled, without salt | uk satfat [satfat] | 0.166 | USDA 0.166; Frida 0.27; Fineli 0.076 | 0.166 | OK |
| 11 | `blend:u172177` Cheese, brie | uk vitaminB6 [vitaminB6] | 0.186 | USDA 0.235; AFCD 0.12; CNF 0.137; Frida 0.235 | 0.186 | OK |
| 12 | `blend:u170428` Peppers, green, cooked, boiled, drained, without salt | eu vitaminD3 [vitaminD3] | 0.0 | Ciqual 0; BLS 0; KFCDb 0 | 0 | OK |
| 13 | `blend:u174256` Mung beans, mature seeds, dry (uncooked weight) | uk iron [iron] | 6.74 | USDA 6.74; Frida 6.74; BLS 6 | 6.74 | OK |
| 14 | `blend:u169928` Peaches, yellow, raw | us calcium [calcium] | 5.0 | USDA 6; AFCD 5; KFCDb 5 | 5 | OK |
| 15 | `blend:garlic` Garlic | eu phosphorus [phosphorus] | 156.0 | CoFID 170; Fineli 153; KFCDb 156 | 156 | OK |
| 16 | `blend:afcd-f000089` Apple, dried | eu sodium [sodium] | 87.0 | AFCD 260; Ciqual 87; Frida 87; Fineli 6.1; BLS 80.8 | 87 | OK |
| 17 | `blend:blueberries` Blueberries (frozen) | eu valine [valine] | 0.022 | USDA 0.018; Frida 0.0352; KFCDb 0.022 | 0.022 | OK |
| 18 | `blend:cheddar` Cheddar cheese | eu magnesium [magnesium] | 28.0 | USDA 27; CoFID 29; CNF 37; Fineli 25 | 28 | OK |
| 19 | `blend:orange` Oranges | us leucine [leucine] | 0.02835 | USDA 0.023; Frida 0.02835; BLS 0.032 | 0.02835 | OK |
| 20 | `blend:cashews` Cashews | us protein [protein:nxf] | 17.96 | USDA 18.22; CoFID 17.7; AFCD 17; Fineli 20 | 17.96 | OK |

## 6. notUsed handling (30 random groups with a not-used record, seed 2026)

Scope: 198 of the 556 groups have at least one not-used record. The sample has 30 groups with 37 not-used records. Each not-used record was compared with every other member (same similarity measure as section 4). Script and output: `review/notused.py`, `review/notused_out.txt`.

| Reason given | Records | Finding |
|---|---|---|
| "values taken from USDA/MEXT, which is already counted" (CNF, KFCDb) | 24 | **All confirmed.** Each is 94-100% identical to the named source in the group (for example CNF pumpkin 33/33 with USDA, KFCDb dates 29/29 with MEXT). |
| "values nearly identical to X's, counted once" | 4 | **3 confirmed** (Ciqual swede 18/19 with USDA; Ciqual okra 19/19; CNF lychee 20/21 with Frida). The 4th (KFCDb peanut oil, similar to Fineli) rests on only 2-5 non-zero values. That is trivially true for an oil, and harmless. |
| "its table says the values are borrowed, without naming the source" (BLS, AFCD) | 9 | Correct as the table's own flag. **Only 2 resemble a group member** (AFCD palm oil 5/5 with USDA; AFCD lemon peel 17/20 with USDA). The other 7 resemble no member, at most 6/32: BLS pearl barley, lima bean, sheep milk, skim and whole milk powder, lychee, persimmon. Excluding them is conservative (data lost, no error introduced). |

Problems found:
- **The opposite error is more common.** In 5 of the 30 sampled groups, a *used* record is itself a copy that was not detected:
  - Pecans: Ciqual 19/21 and Fineli 20/22 with USDA;
  - Barley pearled: Ciqual 17/18;
  - Blackberries frozen: Frida 18/20;
  - Spelt: Ciqual 17/18;
  - Lemon peel: Frida, 13/19 (weaker).

  Copy labelling relies on the tables' own source flags (CNF, KFCDb) and on a too-strict similarity test. Tables that borrow without saying so are missed: Ciqual, Frida and Fineli from USDA, BLS from CoFID.
- Outside the sample: KFCDb rainbow trout `K1170010009f` (in "Fish, trout, rainbow, farmed, cooked") is labelled "values taken from USDA". Its source says `USDA('15)`, but it matches the farmed USDA record on only 3/23 values. Its calcium of 86 mg points to the USDA *wild* rainbow trout. It is not used, but it is displayed as a member of a *farmed* group. It should be dropped from the group, not just marked not used.
- Not-used records are listed in the group, so a mis-grouped not-used record still shows the user a wrong "same food" claim. Not-used records should pass the same facet rules as used ones.

## 7. Other risks noticed

1. **The data changed during the review.** The working tree (uncommitted, 559 foods, regenerated 07:59 UTC) differs from `bad897b` in 11 groups (6 changed, 1 removed, 4 new):
   - MEXT records added to 5 groups: rye flour (still WRONG: a sixth flour grade), rice bran, peanut butter, low-fat yoghurt, whole yoghurt;
   - CNF added to pink salmon;
   - 4 new groups: chia (USDA + MEXT), fat-free yoghurt, brown rice flour, canned carrot juice;
   - `blend:afcd-f008209` (AFCD + Fineli chia) removed.

   In the new "Yogurt low fat, 0.1% fat" group, the Fineli fat-free yoghurt `32598` carries values identical to Fineli skim milk `29211`, so a borrowed-from-milk record is used as an independent yoghurt value. None of the 31 flagged groups is fixed in the working tree.
2. **Name-level flags outside the reviewed sample.** These were seen in a names-only scan of the 150 unreviewed groups; they are not counted in the rates.
   - `blend:u174926` USDA white bread "prepared from recipe" (enriched flour: iron 3.18, thiamin 0.43) vs Frida "Bread, white" (iron 0.91, thiamin 0.15): **likely WRONG** (enriched vs unenriched).
   - `blend:cofid-13-559` CoFID "Beans, butter, canned, re-heated, drained" vs AFCD "Bean, lima, dried, boiled, drained": DOUBTFUL (canned vs boiled from dried).
   - `blend:cnf-7087` CNF garlic bread vs KFCDb "French garlic bread": DOUBTFUL (recipes differ; CNF thiamin 0.46 vs 0.18 suggests enriched flour).
   - `blend:ciqual-6564` "Veal, meat, cooked (average)" vs KFCDb "Veal, USA, lean, boiled": DOUBTFUL (average cut vs lean, boiled).
3. **The "cooked" wildcard.** `states_same` lets "cooked" match any cooking method (Ciqual "cooked (average)", MEXT "boiled", BLS "fried without fat"). That is reasonable for vegetables, but riskier for meat and fish, where pan-fried, roasted and poached differ in water and fat. Restrict the wildcard to vegetables and pulses.
4. **Qualifier words dropped or ignored.** These words carry meaning: "water" spinach, "japanese" chestnut, "organic" bread (which lost its bread type), "cream cheese *product*", flour type numbers, "light"/"dark". A small list of identity qualifiers (species, product-category words, grade numbers) should block a match. The current approach uses a list of qualifiers that are allowed to be ignored (`BLEND_QUALIFIER`).
5. **Species mismatches hidden behind common names.** Examples: Pacific vs Atlantic cod (acceptable), Allium ursinum vs A. monanthum, Japanese vs European chestnut, kangkong vs spinach. When a table gives a Latin binomial (KFCDb, CNF `scientificName`), use it as a check.
6. **Fortification in other tables.** There are value signals of added vitamin C (KFCDb nectars and juices) and vitamin D (CNF fluid milks and creams). Section 2, item 3 applies here too.
7. **Two-value groups (47%).** For contradictory pairs, consider publishing no point value, or the value of the record whose name matches the blended name, rather than the midpoint. The mung bean sodium (117 mg for an unsalted food) shows why.

## 8. Files

- `review/load.py`: loader (data dir via `BLEND_DIR`; default is the committed copy in `review/head/`).
- `review/pick.py`, `review/selection.json`: review set.
- `review/dump.py`, `review/dump_head.txt`: compact dump of all 406 reviewed groups (energy, protein, fat, carbohydrate, sugars, fibre, sodium, calcium, vitamin C, iron, vitamin A per record).
- `review/judgments.py`: verdicts and rules.
- `review/copies.py`, `review/undetected_copies.json`: copy detection.
- `review/notused.py`, `review/notused_out.txt`: notUsed check.
- `review/spot.py`, `review/spot_out.txt`: value spot-check.
- `review/keywords.py`, `review/fortif.py`: name-keyword and fortification-signal scans.
- `review/vdiff.py`: version diff.
- `review/report_tables.py`: builds the tables in this report.
