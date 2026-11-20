# Review of the name-reading change (commit a3ddf89), 20 Nov 2026

Scope: every blended group and Common-list flag that changed between 69c4cd9 and a3ddf89, each checked against the
source records in the table files (and BLS values against the archived BLS 4.0 file).

## Blended groups (4 changed)
| Group | Change | Verdict |
|---|---|---|
| Skimmed milk, pasteurised (CoFID 12-307, Ciqual 19051) | BLS M111100 joined | Right food. Its values don't count: BLS gives values in this record as borrowed without naming the source, so the blended values are unchanged. |
| Whole milk, pasteurised (CoFID 12-596, Ciqual 19024) | BLS M111300 joined and counts | Right food. All 43 changed values checked: each is the median of the records with the standard's definition. Vitamin A 31.5 µg (RE: CoFID 38, BLS 25; Ciqual is RAE); vitamin E 0.092 mg (Ciqual, BLS); niacin equivalents 1.017 mg worked out (0.2 + tryptophan 49 mg ÷ 60). Vitamin D is now BLS's 0 µg (D2 + D3, both "Analysis" in the BLS file), a one-table value, replacing Ciqual's 0.06 µg (another definition). Faithful to the sources. |
| Fat-free yoghurt: Frida 1598 + MEXT 13054 → Fineli 32598 + MEXT 13054 | MEXT moved | Both groups pass every check. BLS M141100 (read correctly now) grouped with Frida 1598 first; that BLS record's values don't count, so the Frida pair had one independent table and was dropped. The resulting group is sound. Open: a record whose values can't count can still take a partner from a group where it would count. |

## Common list (7 foods became common)
Fine: BLS ultra-heated skimmed milk (pairs with skimmed milk in 8 tables), BLS lactose-free skimmed milk (Ciqual, CoFID
skimmed milk), BLS lactose-free skimmed yoghurt (Frida, CoFID, USDA plain low-fat yoghurt), CNF evaporated skim milk
(BLS, USDA).
Wrong pairs found:
- Fineli 33284 "Yoghurt, plain, fat-free, lactose-free, 1 ug vitamin d" read as BLS yoghurt plus the word "ug": a
  fortified product. Fixed: a name stating a vitamin D dose pairs only with another such name, and the blend's
  fortified-name rule recognises "1 ug vitamin d" (the blend's value check already caught it).
- BLS lactose-free yoghurt with Fineli 33221 "Yoghurt, flavoured …" (sugars 6 g vs 12 g). Fixed: "flavoured" makes
  another product.
- BLS soured skimmed milk with Fineli 29819 (gefilus, 1 µg vitamin D), and CNF evaporated skim milk (3.7 µg) with BLS
  (0 µg): vitamin D suggests fortification the names don't state. Not fixed: the Common list has no value-based
  fortification check (the blend has one). Neither is blended.

## Effect of the fixes
Blended: no change (437 foods). Common list 4,922 → 4,911: removed flavoured rice, yoghurt and peanuts paired with
plain ones, and Fineli foods with a named vitamin D dose paired with unfortified ones. One over-cautious removal:
AFCD "Yoghurt, vanilla flavoured" no longer pairs with USDA "Yogurt, vanilla"; reading "vanilla flavoured" as
"vanilla" was tried and reverted, because it let flavour words ("strawberry", "fruit") pass as one extra word and
paired flavoured with plain yoghurt. A missed pair changes no value.

## Open
- Flavour words (strawberry, fruit, vanilla) pass as one extra word in the Common list; its composition check does
  not compare sugars.
- No value-based fortification check in the Common list.
- Cluster order lets a non-counting record take a partner (yoghurt case above).
