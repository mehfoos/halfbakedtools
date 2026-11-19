# Second independent review of the Blended table, 19 Nov 2026

A separate agent, without access to the first review, checked all 505 blended foods at commit b250f34 (automated, without manual human verification). Its report is kept below as written. Outcome, applied in the next commit: the 11 WRONG and the DOUBTFUL groups it listed are separated by tested rules (class SecondReview in `test_blend_all.py`); copies counted twice: 0 by its own script (`copies2.py`); values: all correct; blended names made distinct; palm kernel oil named; plant foods get no EPA, DHA or retinol; two values five-fold apart give no value; totals above 100 g flagged. Blended foods: 440.

---

## Independent review: Blended (beta) food table

Reviewer: independent check, 19 Nov 2026. Data: `tools/nutrient-planner/data/foods/` (foods-blend*.json and the ten source table files), read only. Scripts are in `/home/claude/review2/` (`load.py`, `dump.py`, `copies2.py`, `crossgroup.py`, `valuecheck.py`, `classify.py`, `gen_table.py`). Every judgement on grouping was made from names and values before reading `blend_all.py` and `common_list.py`; the "Suggested general rule" column and the section on causes were written afterwards.

## 1. Summary

| | Count | Share of 505 |
|---|---|---|
| Blended foods reviewed | 505 (1,548 member records; 1,329 used, 219 not used) | 100% |
| SAME | 458 | 90.7% |
| DOUBTFUL | 36 | 7.1% |
| WRONG | 11 | **2.2%** |
| Foods where a copy is counted twice (near-complete copy, both used) | 17 | 3.4% |
| Further foods with probable partial copies (8–10 of 15–17 core values identical) | 18 | 3.6% |
| notUsed: 30 random groups, 38 not-used records | 34 correct copy exclusions; 4 "unnamed borrowed source" exclusions are not copies | |
| Values: 30 random checks (food, nutrient, standard) | 30/30 equal the median of the used records' source values in the definition named in `d` | |
| Values: full sweep of all 69,951 non-missing values (3 standards, 49 nutrients) | 0 wrong values; 8 cosmetic rounding differences in the `s` text | |

**Headline.** The arithmetic is right. Every published value is the median of the used records, read correctly from the source files, within the named definition. The errors are all in **which records are grouped** and **which count**:

- **Grouping (11 WRONG, 2.2%; WRONG + DOUBTFUL 9.3%).** 9 of the 11 WRONG groups come from one rule. `common_list.STATES` maps boiled, simmered, poached, steamed and blanched to a single state ("moist"). Also, USDA "cooked, dry heat" becomes plain "cooked", which fits any method. The other two WRONG groups: a canned food grouped with a dried-and-boiled one ("re-heated" hides "canned"), and a fortified soya drink grouped with an unfortified one (the name "Soya drink, vitamins" doesn't match `FORTIFIED`).
- **Copies (17 foods).** The copy test (`common_list.copies`) needs at least 70% of the shared non-zero values to agree within 2%, across amino acids, fatty acids and trace minerals too. Frida, Ciqual, BLS, Fineli and KFCDb often take proximates, minerals and vitamins unchanged from USDA or CoFID but recalculate fatty acids and amino acids, so the copies fall under 70%. Example: Frida 390 equals USDA 170572 on all 15 core values but differs on 11 fatty and amino acids, so both are used. In 2- and 3-record groups this copy often *is* the median.
- **Default-readiness: not yet.** Before the blend becomes the default, fix or withdraw the 11 WRONG foods and the 17 double-counted foods. Also: 11 blended names are used twice (22 foods that can't be told apart); one MEXT translation error (palm kernel oil shown as "Oil palm"); one wrong diet label (garlic bread marked vegan); a few implausible values (section 6). Data depth is thin: 30.5% of UK values come from one table and 47% are the mean of two.

## 2. DOUBTFUL and WRONG groups

Rule applied: a different named cooking method is WRONG when the methods clearly differ (steamed or poached against boiled or dry heat). The same goes for canned against not canned, and fortified against not. "Blanched" against "boiled", unspecified "cooked" against a named method, fat level and species are DOUBTFUL. Where a table's "cooked" is in practice its standard method (USDA "cooked" grains are boiled; Ciqual "cooked (average)" vegetables), I counted the group as SAME unless the values disagreed. These SAME-with-a-note groups are #4, 44, 51, 85, 112, 114, 115, 117, 124, 141, 156, 162, 171, 186, 240, 289, 407, 411, 421, 437, 439, 442, 445 and 447 in `/home/claude/review2/dump.txt`. They are worth a look if the method rule is tightened.

| Verdict | Blended food | Member records (table code name) | Reason | Suggested general rule |
|---|---|---|---|---|
| WRONG | `blend:u168484` Sweet potato, cooked, boiled, without skin | USDA 168484 Sweet potato, cooked, boiled, without skin<br>CoFID 13-671 Sweet potato, steamed<br>CNF 2242 Sweet potato, boiled without skin *(not used)*<br>Ciqual 4102 Sweet potato, cooked | USDA and CNF boiled; CoFID 13-671 steamed (used); Ciqual 4102 just "cooked" (used) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:ciqual-20304` Broccoli, steamed | Ciqual 20304 Broccoli, steamed<br>KFCDb F0920000009b Broccoli, Boiled *(not used)*<br>MEXT 06264 Broccoli, flower head, boiled | Named "Broccoli, steamed", but MEXT 06264 is boiled (used) and KFCDb is boiled (not used) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:cauliflower` Cauliflower (cooked) | USDA 170397 Cauliflower, cooked, boiled, drained, without salt<br>AFCD F002377 Cauliflower, fresh, boiled, drained<br>CNF 2046 Cauliflower, boiled, drained *(not used)*<br>Ciqual 20312 Cauliflower, steamed<br>BLS G311142 Cauliflower steamed<br>KFCDb F0300000009c Cauliflower(Brassica oleracea var. botrytis L.), Blanched<br>MEXT 06055 Cauliflower, flower head, boiled | Boiled (USDA, AFCD, MEXT) mixed with steamed (Ciqual 20312, BLS G311142) and blanched (KFCDb). Ciqual and BLS boiled cauliflower form a separate food (blend:ciqual-20017) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:u168390` Asparagus, cooked, boiled, drained | USDA 168390 Asparagus, cooked, boiled, drained<br>CoFID 13-638 Asparagus, steamed<br>CNF 1991 Asparagus, boiled, drained *(not used)*<br>BLS G450142 Asparagus steamed *(not used)*<br>KFCDb F1220000009c Asparagus(Asparagus officinalis L.), Blanched | USDA boiled; CoFID 13-638 steamed (used); KFCDb blanched (used) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:u172001` Fish, salmon, pink, cooked, dry heat | USDA 172001 Fish, salmon, pink, cooked, dry heat<br>CNF 3228 Fish, salmon, pink (humpback), poached | USDA dry heat vs CNF 3228 poached (moist heat). "dry heat" is stripped, so USDA counts as plain "cooked", which fits any method | Read USDA 'dry heat' as roast/grill, not as unspecified 'cooked' |
| WRONG | `blend:cofid-13-211` Cassava, steamed | CoFID 13-211 Cassava, steamed<br>AFCD F002285 Cassava, peeled, fresh, boiled, drained | Cassava steamed (CoFID) vs boiled, drained (AFCD) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:cofid-13-379` Taro, steamed | CoFID 13-379 Taro, steamed<br>AFCD F009093 Taro, peeled, fresh, boiled, drained | Taro steamed (CoFID) vs boiled, drained (AFCD) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:cofid-13-401` Yam, steamed | CoFID 13-401 Yam, steamed<br>BLS K440132 Yam boiled | Named "Yam, steamed", but BLS K440132 is yam boiled | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:cofid-13-516` Pak choi, steamed | CoFID 13-516 Pak choi, steamed<br>BLS G324132 Pak choi boiled | Pak choi steamed (CoFID) vs boiled (BLS) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| WRONG | `blend:cofid-13-559` Beans, butter, canned, re-heated, drained | CoFID 13-559 Beans, butter, canned, re-heated, drained<br>AFCD F000442 Bean, lima, dried, boiled, drained | Canned, re-heated, drained butter beans (CoFID) vs dried lima boiled (AFCD). CoFID gives no sodium, so the blended sodium (7 mg, AFCD only) is shown for a canned food | 'canned'/'tinned' must be a fact separate from the cooking state; 're-heated' currently wins and hides 'canned' |
| WRONG | `blend:fineli-31246` Soya drink, vitamins | Fineli 31246 Soya drink, vitamins<br>BLS H841100 Soya drink unsweetened | "Soya drink, vitamins" (fortified: Ca 120 mg, B12 0.15 ug, riboflavin 0.24 mg) vs BLS "Soya drink unsweetened" (Ca 14.6, riboflavin 0.017). Blended Ca 67 mg fits neither | Add 'vitamins', 'with vitamins', 'calcium' to FORTIFIED; use a lower calcium gap (e.g. 50 mg, three-fold) and B12/riboflavin for plant drinks |
| DOUBTFUL | `blend:oats` Porridge oats (dry) | CoFID 11-788 Porridge oats, unfortified<br>KFCDb A0020000009a Oat, Oatmeal | KFCDb A0020000009a "Oat, Oatmeal" fibre 18.8 g vs CoFID porridge oats 7.8 g (KFCDb carbohydrate by difference is 46 g). Its values suggest a different product (whole or hulled oats) | Check fibre (two-fold) as part of the composition test |
| DOUBTFUL | `blend:milk` Semi-skimmed milk | USDA 172205 Milk, reduced fat, fluid, 2% milkfat, without added vitamin A and vitamin D<br>Ciqual 19033 Milk, semi-skimmed (average)<br>Fineli 29210 Milk, 1.5% fat, without added vitamin d, organic | USDA 172205 is 2% fat; Ciqual 19033 and Fineli 29210 are 1.5%. Shown as "Semi-skimmed milk" (UK 1.5-1.8%) | Compare fat levels stated in names (2% vs 1.5%), not only fat within 0.5 g |
| DOUBTFUL | `blend:broccoli` Broccoli (cooked) | USDA 169967 Broccoli, cooked, boiled, drained, without salt<br>AFCD F001900 Broccoli, fresh, boiled, drained<br>CNF 2375 Broccoli, boiled, drained *(not used)*<br>Ciqual 20351 Broccoli, cooked (average)<br>Frida 914 Broccoli, boiled<br>BLS G312132 Broccoli boiled<br>KFCDb F0920000009c Broccoli, Blanched | KFCDb F0920000009c "Blanched" with boiled (and a copy, see below) | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:onion` Onions (cooked) | USDA 170001 Onions, cooked, boiled, drained, without salt<br>CNF 2402 Onion, boiled, drained *(not used)*<br>Ciqual 20035 Onion, cooked<br>BLS G480132 Onion boiled<br>KFCDb F1320000009c Onion, Blanched | KFCDb blanched with boiled; Ciqual "cooked" | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:leeks` Leeks (cooked) | USDA 168426 Leeks, (bulb and lower leaf-portion), cooked, boiled, drained, without salt<br>AFCD F005162 Leek, fresh, boiled, drained<br>CNF 2397 Leeks (bulb and lower-leaf portion), boiled, drained *(not used)*<br>KFCDb F0520000009c Leek(Allium porrum L.), Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:butter-beans` Butter beans (cooked) | USDA 174253 Lima beans, large, mature seeds, cooked, boiled, without salt<br>CNF 2004 Beans, lima, boiled, drained *(not used)*<br>BLS G780432 Lima bean/butter bean, mature, boiled | CNF 2004 "Beans, lima, boiled, drained" is immature (green) lima (vitamin C 10 mg, its USDA source NDB 11032). It is listed as the same food and is excluded only because the rule mislabels it as "taken from USDA" | Check that a CNF record's usdaNdb is the group's USDA record before calling it a copy |
| DOUBTFUL | `blend:u175178` Fish, cod, Pacific, cooked | USDA 175178 Fish, cod, Pacific, cooked<br>Ciqual 26023 Cod, roasted/baked<br>KFCDb K0440000009f Pacific cod(Gadus macrocephalus), Roasted | USDA and KFCDb are Pacific cod (Gadus macrocephalus); Ciqual 26023 "Cod" is presumably Atlantic cod | Treat Atlantic/Pacific as a species difference for fish, not as an origin qualifier |
| DOUBTFUL | `blend:u168449` Pumpkin, cooked, boiled, drained, without salt | USDA 168449 Pumpkin, cooked, boiled, drained, without salt<br>AFCD F007554 Pumpkin, peeled, fresh, boiled, drained<br>CNF 2442 Pumpkin, boiled, drained *(not used)*<br>Ciqual 20096 Pumpkin, cooked<br>BLS G581132 Pumpkin (C. pepo) boiled | Pumpkin species differ (BLS C. pepo; AFCD Australian pumpkin; USDA unspecified). Vitamin A RE 103-502 ug | Require the same species when a table names it |
| DOUBTFUL | `blend:bls-h610132` Bamboo shoots boiled | BLS H610132 Bamboo shoots boiled<br>KFCDb F167000B119c Bamboo shoot, Blanched | BLS boiled with KFCDb F167000B119c "Blanched". KFCDb's own "Boiled" record (F167000B119b) is in blend:u169211. The two KFCDb records differ (K 855 vs 156 mg) | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:u169229` Aubergine, cooked, boiled, drained, without salt | USDA 169229 Eggplant, cooked, boiled, drained, without salt<br>CNF 2089 Eggplant (aubergine, brinjal), boiled, drained *(not used)*<br>Ciqual 20002 Eggplant, cooked *(not used)*<br>BLS G510132 Aubergine boiled<br>KFCDb F0030000009c Eggplant(Solanum melongena L.), Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:u169976` Cabbage, cooked, boiled, drained, without salt | USDA 169976 Cabbage, cooked, boiled, drained, without salt<br>CNF 2362 Cabbage, boiled, drained *(not used)*<br>KFCDb F1290000009c Cabbage, Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:u169989` Celery, cooked, boiled, drained, without salt | USDA 169989 Celery, cooked, boiled, drained, without salt<br>CNF 2387 Celery, boiled, drained *(not used)*<br>KFCDb F1070000009c Celery, Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:u170110` Peppers, red, cooked, boiled, drained, without salt | USDA 170110 Peppers, sweet, red, cooked, boiled, drained, without salt<br>CNF 2486 Pepper, sweet, red, boiled, drained *(not used)*<br>Ciqual 20088 Sweet pepper, red, cooked<br>BLS G543032 Sweet pepper red, boiled<br>KFCDb F196000C029c Sweet pepper(Capsicum annuum L.), Red, Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:cnf-2588` Nuts, pistachio nuts, dry roasted | CNF 2588 Nuts, pistachio nuts, dry roasted<br>Frida 757 Pistachio nuts, dry roasted with salt<br>BLS H250600 Pistachio nut roasted without fat<br>KFCDb E0320000009n Pistachio nut(Pistacia vera L.), Roasted | Frida 757 is named "dry roasted with salt" but has sodium 10 mg, a copy of Fineli 31212 (unsalted). Name and values conflict | When the name says salted but the sodium says unsalted, keep the record out |
| DOUBTFUL | `blend:u170428` Peppers, green, cooked, boiled, drained, without salt | USDA 170428 Peppers, sweet, green, cooked, boiled, drained, without salt<br>CNF 2414 Pepper, sweet, green, boiled, drained *(not used)*<br>Ciqual 20086 Sweet pepper, green, cooked *(not used)*<br>BLS G541032 Sweet pepper green, boiled<br>KFCDb F196000C059c Sweet pepper(Capsicum annuum L.), Green, Blanched | KFCDb blanched with boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:u170847` Cheese, mozzarella, part skim milk | USDA 170847 Cheese, mozzarella, part skim milk<br>KFCDb M0100020009a Cheese, Mozzarella | USDA part-skim mozzarella vs KFCDb "Cheese, Mozzarella" (fat level not stated) | — |
| DOUBTFUL | `blend:u172006` Fish, tuna, yellowfin, fresh, cooked, dry heat | USDA 172006 Fish, tuna, yellowfin, fresh, cooked, dry heat<br>BLS T124182 Yellowfin tuna fried without fat (pan) | Yellowfin tuna dry heat (USDA) vs pan-fried without fat (BLS) | minor |
| DOUBTFUL | `blend:u172177` Cheese, brie | USDA 172177 Cheese, brie<br>CNF 20 Cheese, brie<br>Frida 139 Cheese, Brie, 60 % fidm.<br>BLS M601700 Brie cheese min. 50 % fat in dry matter *(not used)*<br>KFCDb M0100090009a Cheese, Brie *(not used)* | Brie with 60% fat in dry matter (Frida 139, used) with USDA/CNF, while BLS 50% fidm is not used and BLS 60% fidm sits in another blended food (blend:afcd-f002407) | Compare fat-in-dry-matter levels stated in names |
| DOUBTFUL | `blend:u174234` Fish, ling, cooked, dry heat | USDA 174234 Fish, ling, cooked, dry heat<br>BLS T202182 Ling fried without fat (pan) | Ling dry heat (USDA) vs pan-fried without fat (BLS) | minor |
| DOUBTFUL | `blend:cofid-18-179` Lamb, shoulder, whole, roasted, lean | CoFID 18-179 Lamb, shoulder, whole, roasted, lean<br>CNF 3460 Lamb, Canadian, shoulder, whole, lean, cooked | Lamb shoulder roasted, lean (CoFID) vs CNF "lean, cooked" (method not stated) | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:cofid-18-479` Lamb, leg, whole, roasted, lean only | CoFID 18-479 Lamb, leg, whole, roasted, lean only<br>CNF 3433 Lamb, Canadian, leg, whole, lean, cooked | Lamb leg roasted, lean (CoFID) vs CNF "lean, cooked" (method not stated) | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:ciqual-20025` Celeriac, cooked | Ciqual 20025 Celeriac, cooked<br>BLS G660162 Celeriac baked | Celeriac "cooked" (Ciqual) vs baked (BLS) | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:ciqual-25996` Salmon, cooked (average) | Ciqual 25996 Salmon, cooked (average)<br>BLS T410132 Salmon poached | Salmon "cooked (average)" (Ciqual) vs poached (BLS) | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:ciqual-20354` Celery stalk, cooked (average) | Ciqual 20354 Celery stalk, cooked (average)<br>BLS G220142 Stalk celery braised without fat | Celery "cooked" (Ciqual, sodium 213 mg) vs braised without fat (BLS, 85 mg) | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:ciqual-20358` Tomato, flesh and skin, cooked (average) | Ciqual 20358 Tomato, flesh and skin, cooked (average)<br>BLS G561132 Tomato boiled<br>KFCDb F1860000009c Tomato, Blanched | Ciqual "cooked", BLS boiled, KFCDb blanched | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:bls-c352032` White rice boiled | BLS C352032 White rice boiled<br>KFCDb A013000A039a Rice, White, Cooked | White rice boiled (BLS, carbohydrate 24.8 g) vs KFCDb "Rice, White, Cooked" (Korean steamed rice, 33.2 g): water content differs | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:ciqual-28010` Pork, shoulder, cooked | Ciqual 28010 Pork, shoulder, cooked<br>BLS U664162 Pork shoulder (with fat and rind) fried without fat (oven) | Pork shoulder "cooked" (Ciqual) vs BLS "with fat and rind, fried without fat (oven)" | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:cnf-2169` Potato, mashed, homemade, prepared with whole milk and margarine | CNF 2169 Potato, mashed, homemade, prepared with whole milk and margarine<br>Ciqual 4047 Mashed potatoes (average) | Mashed potato made with whole milk and margarine (CNF, sodium 333 mg) vs Ciqual "Mashed potatoes (average)" (140 mg): the recipes differ | Prepared dishes need the same recipe |
| DOUBTFUL | `blend:ciqual-6564` Veal, meat, cooked (average) | Ciqual 6564 Veal, meat, cooked (average)<br>KFCDb I034001D159b Veal Meat, USA, Lean, Boiled | Veal "meat, cooked (average)" (Ciqual) vs KFCDb "Veal Meat, USA, Lean, Boiled" | An unspecified 'cooked' record should not join a specific method; require the same method or a reviewed equivalence |
| DOUBTFUL | `blend:afcd-f006191` Oil, vegetable | AFCD F006191 Oil, vegetable<br>Ciqual 17001 Vegetable oil (average) | "Oil, vegetable" (AFCD) vs "Vegetable oil (average)" (Ciqual): unspecified blends whose fatty-acid profile depends on the oils used | Keep unspecified blends out |
| DOUBTFUL | `blend:afcd-f005968` Mussel, blue, steamed | AFCD F005968 Mussel, blue, steamed<br>Frida 1661 Blue mussel, boiled | Mussel steamed (AFCD, Ca 173 mg) vs boiled (Frida, Ca 48 mg) | Keep steamed, boiled, poached and blanched apart (split the 'moist' state) |
| DOUBTFUL | `blend:kfcdb-f041000b099c` Carrot, Roots, Blanched | KFCDb F041000B099c Carrot, Roots, Blanched<br>MEXT 06213 Carrot, root, with skin, boiled | KFCDb blanched vs MEXT boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:kfcdb-f095000b099c` Beet(Beta vulgaris L.), Roots, Blanched | KFCDb F095000B099c Beet(Beta vulgaris L.), Roots, Blanched<br>MEXT 06244 Red beet, root, boiled | Beetroot: KFCDb blanched (carbohydrate 1.7 g) vs MEXT boiled (9.8 g) | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:kfcdb-g0040000009c` Oyster mushroom, Blanched | KFCDb G0040000009c Oyster mushroom, Blanched<br>MEXT 08027 Oyster mushroom, boiled | KFCDb blanched vs MEXT boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:kfcdb-g0230000009c` King oyster mushroom(Pleurotus eryngii), Blanched | KFCDb G0230000009c King oyster mushroom(Pleurotus eryngii), Blanched<br>MEXT 08048 King oyster mushroom, boiled | KFCDb blanched vs MEXT boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |
| DOUBTFUL | `blend:kfcdb-g0250040009c` Winter mushroom(Flammulina velutipes Sing.), Blanched | KFCDb G0250040009c Winter mushroom(Flammulina velutipes Sing.), Blanched<br>MEXT 08002 Winter mushroom, boiled | KFCDb blanched vs MEXT boiled | Treat KFCDb/MEXT 'blanched' as its own state (KFCDb itself publishes both 'Boiled' and 'Blanched' for some foods) |


## 3. Copies counted twice

Method (`copies2.py`): for every two **used** records in a group, I compared 17 directly comparable values: protein, fat, Ca, Fe, Mg, P, K, Na, Zn, Cu, vitamin C, thiamin, riboflavin, preformed niacin, B6, retinol and B12. Values match when they agree within 0.6%; a pair where both values are zero is skipped.

**Near-complete copies, both used (17 foods):**

| Blended food | Records (both used) | Identical core values | Note |
|---|---|---|---|
| `blend:broccoli` | USDA 169967 / Frida 914 | 14/15 | Frida borrowed USDA; amino and fatty acids recalculated |
| `blend:u167749` Lemon peel | USDA 167749 / Frida 756 | 13/14 | AFCD and CNF copies were correctly excluded |
| `blend:u168437` Shiitake, cooked | USDA 168437 / CoFID 13-295 | 10/11 | |
| `blend:u169248` Iceberg lettuce | USDA 169248 / Ciqual 20200 | 14/15 | |
| `blend:cofid-13-522` Rocket | CoFID 13-522 / BLS G130100 | 11/15 | P, F, fibre, Na, Ca, K, B1 identical |
| `blend:u169742` Rice noodles, dry | USDA 169742 / BLS C559000 | 12/14 | |
| `blend:u169994` Chives | USDA 169994 / CoFID 13-887 | 14/15 | |
| `blend:u170410` Onions, frozen | USDA 170410 / Frida 424 | 15/15 | every shown value identical |
| `blend:u170572` Cashews, oil roasted | USDA 170572 / Frida 390 | 15/15 | |
| `blend:u171314` Ghee | USDA 171314 / CNF 7829 | all values identical | CNF record has no USDA link label |
| `blend:u174185` Carp | USDA 174185 / Ciqual 27004 | 14/17 | |
| `blend:u175127` Northern pike | USDA 175127 / Ciqual 27002 | 13/17 | |
| `blend:cofid-13-148` Alfalfa sprouts | CoFID 13-148 / Fineli 11074 | 12/15 | both carry USDA's alfalfa values |
| `blend:cofid-13-358` Spaghetti squash | CoFID 13-358 / Ciqual 20143 | 12/15 | |
| `blend:cnf-2117` Looseleaf lettuce | CNF 2117 / Frida 591 | 14/15 | CNF 2117 is itself USDA 169249 (see below) |
| `blend:ciqual-26026` Mullet | Ciqual 26026 / KFCDb K1200000009f | 14/17 | KFCDb labels it "data from another table" |
| `blend:frida-515` Pecans | Frida 515 / KFCDb E0330000001a | 14/14 | both are USDA 170182 |

**Probable partial copies (8–10 identical, both used):** `u170033` (USDA/Ciqual 4002), `cucumber` (USDA/Ciqual 20019), `lettuce` (Frida 600/BLS G107100), `u169118` (USDA/Ciqual 13037), `mozzarella` (USDA/Fineli 29239: Ca, Fe, Mg, P, K, Zn, Cu), `parmesan` (USDA/Frida 309), `u168488` (USDA/CoFID 13-381), `u169124` (CoFID 14-376/BLS F501100), `u173727` (USDA/Fineli 31216), `garlic` (CoFID 13-244/Fineli 393), `cofid-11-002` (CoFID/Fineli 151), `cofid-13-187` (CNF 2040/Frida 573), `cofid-14-323` (CoFID/BLS F311100), `ciqual-13111` (Ciqual/Frida 1166), `cnf-2216` (CNF/Ciqual 20083), `afcd-f003192` (CNF 2067/Fineli 34238), `frida-1081` (Frida/BLS C457000, both = USDA rice bran: Ca 57, Fe 18.5, B1 2.75), `cofid-12-358` (CoFID/Fineli 654). Oils (several identical zeros or near-zeros) are not counted.

**The same source data in two blended foods** (not double-counted within one food, but the same food appears twice in the picker, or a split group). From `crossgroup.py` (14 or more of 15 identical) and the manual pass:
- `kiwi` / `kiwi-2`: CNF 1585 = USDA 168153
- `raspberries` / `afcd-f007618`: CNF 7426 (frozen) = USDA 167755 (raw)
- `u169249` / `cnf-2117`: USDA 169249 = CNF 2117
- `u169928` / `cofid-14-299`: USDA 169928 = CNF 1728
- `u170182` / `frida-515`: pecans
- `u170184` / `cnf-2588` / `cnf-2637`: Frida 757 = Fineli 31212 ≈ Fineli 33131
- `cofid-13-240` / `cnf-2090`: Frida 585 = CNF 2090
- `peas` / `ciqual-20124`: Ciqual 20124 = USDA 170017
- `u173756` / `ciqual-20516`: Ciqual = USDA chickpeas
- `u168933` / `ciqual-9610`: Ciqual = USDA semolina
- `red-lentils` / `frida-1799`: BLS H730000 ≈ USDA 174284
- `cofid-13-187` / `cnf-6304`: Frida 573 = Ciqual 20167

**Duplicate CoFID code in the source:** CoFID code 13-669 is used for both "Watercress, raw" (used in `blend:watercress`, correctly) and "Aubergine, flesh and skin, roasted in rapeseed oil" (foods-cofid.json has both). A code-only trace is ambiguous; this one is resolved by name.

## 4. notUsed decisions (30 random groups, seed 20261119)

Sampled: barley, broccoli, carrot, banana, u171689, orange, cashews, u167750, u168429, u168437, u168449, u168871, u169124, u169211, u169261, u169699, u169908, u169980, u170584, u171412, u171427, u171686, u171715, u172023, u173728, u173756, u173946, cofid-14-142, cnf-4872, frida-1320.

- **34 of 38 not-used records are correct copies.** 25 CNF "taken from USDA", 5 Ciqual/Frida "nearly identical to USDA", 2 KFCDb "taken from MEXT" and 2 CNF "nearly identical to Frida/Ciqual" each match the counted record on 14–15 of 15 core values.
- **4 are excluded for "borrowed, source not named" but copy nothing in the group:** AFCD F006163 (coconut oil), BLS Q140000 (hazelnut oil), BLS F515100 (lychee: 3/14 identical to anything), BLS M021000 (goat milk: 4/17). The exclusion is conservative and causes no error, but it removes independent-looking data. In goat milk, iodine then comes from Frida alone (66 µg) while BLS's 4.1 µg is hidden. Other tables' borrowed records (Frida, Ciqual, BLS "d" values, KFCDb) are used, so the policy is uneven.
- **Missed copies in the sample:** `broccoli` (Frida 914), `u168437` (CoFID 13-295) and `u169124` (CoFID/BLS, partial) have a used copy (section 3).
- **Outside the sample, the CNF "taken from USDA" rule is wrong 3 times.** It fires on CNF's own USDA label without checking that the linked USDA food is the one in the group:
  - `butter-beans`: CNF 2004 is *immature* lima (usdaNdb 11032; vitamin C 10 mg; 0/15 identical to USDA 174253). It is a different food, excluded by accident.
  - `u169968`: CNF 2025 is broccoli spears (usdaNdb 11094; 0/15 identical to USDA 169968).
  - `u173953`: CNF 1525 cherimoya matches 1/15 with USDA 173953 but 9/10 with Frida 895, which is used. The count is right by accident.

## 5. Value checks

30 random (food, nutrient, standard) triples, seed 19112026. For each, `valuecheck.py` read the definition from `d`, parsed every table's value from `s`, read the same records' values from the source files (by table and code, using the name where a code is duplicated) and recomputed the median of the used records:

| # | Food | Std | Nutrient | Definition (d) | Published v | Used records' source values | Median | Result |
|---|---|---|---|---|---|---|---|---|
| 1 | `blend:ciqual-9060` | eu | vitaminE | vitaminE:alpha | 0.952 | 1.4, 0.504 | 0.952 | OK |
| 2 | `blend:u169925` | us | calcium | calcium | 22.0 | 18, 26 | 22 | OK |
| 3 | `blend:ciqual-15203` | us | carbohydrate | carbohydrate:avail | 6.915 | 13.8, 0.03 | 6.915 | OK |
| 4 | `blend:cofid-12-379` | uk | carbohydrate | carbohydrate:mono | 7.8 | 7.8 | 7.8 | OK |
| 5 | `blend:frida-154` | us | vitaminD3 | vitaminD3 | 0.0 | 0, 0 | 0 | OK |
| 6 | `blend:u169994` | eu | carbohydrate | carbohydrate:avail | 1.45 | 1.45 | 1.45 | OK |
| 7 | `blend:whole-milk` | uk | epa | epa | 0.0 | 0 | 0 | OK |
| 8 | `blend:u170572` | eu | selenium | selenium | 20.3 | 20.3 | 20.3 | OK |
| 9 | `blend:kfcdb-h0950000580a` | uk | vitaminC | vitaminC | 31.71 | 18.42, 45 | 31.71 | OK |
| 10 | `blend:watercress` | uk | vitaminB6 | vitaminB6 | 0.1795 | 0.129, 0.23 | 0.1795 | OK |
| 11 | `blend:u171243` | eu | retinol | retinol | 314.5 | 339, 290 | 314.5 | OK |
| 12 | `blend:cnf-7087` | eu | vitaminD | vitaminD:d2d3 | 0.2 | 0.2 | 0.2 | OK |
| 13 | `blend:kfcdb-f095000b099c` | uk | zinc | zinc | 0.345 | 0.39, 0.3 | 0.345 | OK |
| 14 | `blend:afcd-f006107` | eu | retinol | retinol | 0.0 | 0, 0 | 0 | OK |
| 15 | `blend:afcd-f009887` | us | phosphorus | phosphorus | 12.5 | 15, 10 | 12.5 | OK |
| 16 | `blend:frida-1052` | us | phenylalanine | phenylalanine | 0.03264 | 0.03264 | 0.03264 | OK |
| 17 | `blend:haricot` | uk | vitaminB12 | vitaminB12 | 0.0 | 0, 0, 0 | 0 | OK |
| 18 | `blend:ciqual-20354` | uk | folate | folate:dfe | 9.0 | 9 | 9 | OK |
| 19 | `blend:cofid-12-380` | eu | vitaminD | vitaminD:frida | 0.04 | 0.04 | 0.04 | OK |
| 20 | `blend:u167747` | uk | vitaminD | vitaminD:d2d3 | 0.0 | 0, 0 | 0 | OK |
| 21 | `blend:leeks` | us | tyrosine | tyrosine | 0.031 | 0.022, 0.044, 0.031 | 0.031 | OK |
| 22 | `blend:afcd-f007610` | uk | phosphorus | phosphorus | 82.0 | 79, 82, 113 | 82 | OK |
| 23 | `blend:afcd-f009886` | eu | methionine | methionine | 0.008 | 0.008 | 0.008 | OK |
| 24 | `blend:frida-1728` | us | retinol | retinol | 0.0 | 0, 0 | 0 | OK |
| 25 | `blend:cnf-6353` | uk | potassium | potassium | 196.0 | 196 | 196 | OK |
| 26 | `blend:ciqual-15203` | uk | protein | protein:nxf | 19.19 | 17.7, 20.67 | 19.185 | OK |
| 27 | `blend:u174256` | us | selenium | selenium | 8.2 | 8.2 | 8.2 | OK |
| 28 | `blend:cnf-4872` | eu | potassium | potassium | 315.0 | 309, 321 | 315 | OK |
| 29 | `blend:frida-629` | eu | riboflavin | riboflavin | 0.08 | 0.05, 0.11 | 0.08 | OK |
| 30 | `blend:spinach` | uk | vitaminD | vitaminD:d2d3 | 0.0 | 0 | 0 | OK |

**Full sweep:** I applied the same check to all 69,951 non-missing values (49 nutrient keys × 3 standards × 505 foods; the calculated keys salt, EPA + DHA, met + cys and phe + tyr were not checked). Every `v` equals the median of the used records' source values, every `s` entry matches its source file, and every not-used flag in `s` matches `records`. The only differences are 8 display roundings in `s` (CoFID retinol equivalents 6.666667 written as 6.667; CoFID grapefruit energy 34.077 written as 34.08), which don't affect `v`. The definition assignment per table matches each file's `definitions` text: for example BLS protein is n625, CoFID carbohydrate is mono, KFCDb carbohydrate and folate are by difference and DFE, Fineli vitamin A is RAE and its vitamin K total, and MEXT vitamin K is K1 + MK-4.

## 6. Default-readiness

**Names shown to users**
- No untranslated Japanese or Korean script appears in any shown name. MEXT names are translated, but some read as table jargon in member lists: "(fermented milks), yogurt, whole milk, unsweetened", "rice, [paddy rice, grain], red rice", "Rice, [other], rice bran", "(peas), green peas, frozen, boiled".
- **Translation error:** MEXT 14010 パーム核油 (palm *kernel* oil) is translated "Oil palm", the same as MEXT 14009 パーム油 (palm oil). Grouping is unaffected (14010 is in `frida-1377` Palm kernel oil), but the shown name is wrong.
- **11 blended names occur twice** (22 foods): Semi-skimmed milk, Skimmed milk, Whole milk, Sunflower seeds, Red cabbage (raw), Grapes, Kiwi fruit, Parmesan, Hazelnuts, Chia seeds, Cheese, brie. Also near-duplicates: Chives / Chives, raw; Semolina (2); Rice, white (3); Goat milk (2); Cauliflower (cooked) / Cauliflower, boiled.
- Names taken straight from tables: "Atemoya(Annona cherimola Mill. x Annona squamosa L.), Raw", "Beet(Beta vulgaris L.), Roots, Blanched" (no space, Latin names), "fidm." (4 foods), "M.F." (5 foods), "Red(Jeokchukmyeon)".
- `blend:milk` "Semi-skimmed milk" is mostly USDA 2% milk; UK semi-skimmed is 1.5–1.8%.

**Labels:** `blend:cnf-7087` Garlic bread is labelled `diet: vegan`, but both records contain retinol (13 and 26 µg) and CNF gives B12 0.08 µg (butter).

**Implausible blended values**
- Macronutrients above 100 g: `cofid-13-590` dried onions 108 g (CoFID's carbohydrate 70.2 g + median fibre 27.2 g, where Fineli alone gives 35 g); `oats` 104 g; `cofid-11-002` pearl barley 104 g. A per-nutrient median from different tables can't be checked against the whole.
- `fineli-31246` soya drink: calcium 67 mg, riboflavin the mean of 0.24 and 0.017 (the fortified/unfortified mix).
- `frida-1252` polished rice: calcium 28.9 mg = mean of MEXT 5 and Frida 52.7. Frida's value is implausible for white rice, and with two tables the median is a mean.
- `ciqual-15203` tahini: available carbohydrate 6.9 g = mean of Ciqual 13.8 and Frida 0.03 (implausible).
- `afcd-f007599` / `afcd-f007597` quinoa: DHA 21–24 mg/100 g from AFCD (42–49 mg). Plants contain no DHA, so this is probably a source or unit error. It gets no "two-fold" caveat because the other value is 0: the two-fold test misses 0-vs-non-zero.
- `ciqual-13089` dried banana and `cofid-14-396` dried pineapple: non-zero DHA from BLS "rescaling".
- `u167747` lemon juice: Frida calcium 110 mg (others 6–14). The median of 4 damps it to 10.5, which is fine.
- `cofid-13-559` canned butter beans: sodium 7 mg (from the dried-boiled AFCD record only).
- Values from one table where a check is advisable: `ciqual-9003` Khorasan wheat selenium 163.6 µg (KFCDb); `u174199` smoked haddock iodine 320 µg (BLS "borrowed from another food"); `afcd-f002463` goat cheese iodine 84 µg; `frida-27` rose hip vitamin A 1,900 µg RE.
- AFCD vitamin D "D3 equivalents" (chicken breast 6 µg) does not leak into the D2 + D3 definition. It is used only where no D2 + D3 value exists (for example duck 1.87 µg, with the "other definition" caveat). That is correct.

**Depth:** of 23,317 non-missing UK values, 7,121 (30.5%) come from one table (caveat "one-table") and 11,031 (47.3%) are the mean of two. UK energy is a one-table value in 412 of 505 foods, because only CoFID (UK factors) or the EU-factor tables count, while protein, fat and carbohydrate come from more tables. 260 of the 505 foods have only 2 records.

## 7. Causes in the code and suggested fixes

These were read after the judgements above were made.

1. **Cooking state** (`common_list.STATES`): split "moist" into boiled/simmered, steamed, poached and blanched. Stop stripping "dry heat" in `NOT_STATE`: read it as roast/bake/grill. Don't let a bare "cooked" join a named method, except for reviewed table conventions (USDA "cooked" grains and pasta = boiled; Ciqual "cooked (average)" vegetables after review). This fixes 9 WRONG and about 25 DOUBTFUL groups.
2. **Canned:** keep "canned/tinned" as its own attribute. At present `state()` returns "cooked" for "canned, re-heated", so the canned check in `ok()` and `identity_ok()` is skipped.
3. **Fortification** (`blend_all.FORTIFIED`, `FORTIFIABLE`): add "vitamins", "with vitamins", "+ calcium". For plant drinks, lower the calcium gap (for example 50 mg with a three-fold ratio) and add riboflavin and B12. Make sure Fineli/BLS soya drinks get the "drinks" category.
4. **Copies:** de-duplicate per nutrient. When two used records give the same value (within 0.5%) for a nutrient, count it once. Alternatively, run `copies()` on protein, fat, minerals and water-soluble vitamins only, not on fatty acids and amino acids, which borrowing tables recalculate. With 8 of 15 identical core values, treat the record as a copy for the nutrients it shares.
5. **CNF family:** call a CNF record a USDA copy only if its `src.usdaNdb` is the NDB number of the group's USDA record, or if `copies()` holds. Otherwise use it, or keep it apart if it is a different food (immature lima).
6. **Borrowed, source not named:** decide one policy for all tables. Either use such records with the "Borrowed" caveat, or exclude every record whose table flags it as borrowed (Frida s1001/s1002, KFCDb "b", BLS "d" values). Say which in the methods text.
7. **One food, one entry:** after grouping, merge groups (or rename them distinctly) when a record in one is a copy of a record in another (section 3). Give duplicate names a distinguishing detail (fat %, origin, raw/frozen).
8. **Plausibility guards before publishing:** protein + fat + carbohydrate + fibre ≤ 100 g per standard; zero EPA, DHA, B12 and retinol for plant foods unless fortified; flag 0-vs-non-zero ranges like two-fold ranges; flag a two-table mean when the two values differ more than 5-fold.
9. **Diet label:** take `diet` from all members (any record with retinol, B12 or a dairy word → not vegan).
