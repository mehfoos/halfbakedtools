# Spot-check of the Blended table, 20 Nov 2026 (after commit c5d2a95)

## Automatic checks, all 438 blended foods (UK values)
- Every blended value lies within the values of the records it came from: no exceptions (an apparent watercress
  mismatch was an error in the checking script; the stored ranges and CoFID 13-669 confirm the blend).
- Plant foods: no vitamin B12, retinol, EPA or DHA.
- Energy against 4 × protein + 9 × fat + 4 × carbohydrate + 2 × fibre: 18 foods differ by more than 15% (and 15 kcal).
  Lemon and passion fruit juice and rose hip: organic acids (not in the formula). The rest (dried pulses, frozen peas
  and sweetcorn, wholemeal flour, semolina, dried onions): each nutrient is blended separately within its own
  definition, so energy can come from one table (e.g. USDA's, with carbohydrate by difference) and carbohydrate
  from another (e.g. AFCD's available carbohydrate). Each value is right for its source and labelled ("other
  definition", "one table"), but the parts don't always add up. Not changed: a method decision for the owner.

## Familiar foods (about 120 records: milk, yoghurt, cheese, eggs, bread, rice, pasta, oats, potato, apple, banana,
orange, tomato, carrot, spinach, broccoli, onion, lentils, beans, peanuts, almonds, oils, butter, chicken, cod, salmon)
Values are in the expected ranges and match their sources. Checked further against the per-table values:
- Whole and semi-skimmed UHT milk iron 0.23 and 0.17 mg (pasteurised milk 0.02–0.05): CoFID's own values, one table.
- White rice (dry) carbohydrate 85.1 g: CoFID, as monosaccharide equivalents (the UK definition); USDA's 78.7 g by
  difference is another definition.
- Grilled chicken breast vitamin C 2.6 mg: BLS recipe calculation, one table.
- Chum salmon (cooked) vitamin D 39 µg: MEXT's value for grilled chum salmon, one table.
- Unsalted butter vitamin D 0 µg: KFCDb's value (D2 + D3, the standard's definition) is used; Fineli's 0.325 µg is
  another definition. See the open question below.

## Open questions for the owner
1. KFCDb vitamin D zeros. KFCDb writes "-" for missing and also 0 (1,253 zeros, 1,491 dashes, 366 values). Most zeros
   are plant foods or egg white, where 0 is right; but canned mackerel, canned saury, whole milk powder, egg powder
   and butter have 0, and these foods contain measurable vitamin D. Without KFCDb's documentation (not archived) we
   can't tell whether 0 means "none detected" or "not analysed". Two blended foods use a KFCDb zero as the only value
   of the standard's definition where another table gives a non-zero value: unsalted butter and AFCD regular-fat
   milk (F005634). Options: treat KFCDb vitamin D zeros in animal foods as missing (NA), or keep them as published.
2. Energy that doesn't add up (above). Options: keep; or work out blended energy from the blended macronutrients.

## Table values noted (not in the Blended table)
KFCDb whole egg 20.9 µg and yolk 44.7 µg vitamin D (other tables about 2 and 5 µg); CNF farm "producer" milk 2.06 µg
(fortified-milk level for raw milk). Both as published; they no longer pair in the Common list.
