# Nutrient planner: design decisions

Tool-specific intent and decisions, newest first. Site-wide principles are in
[`docs/PRINCIPLES.md`](../../docs/PRINCIPLES.md).

## Intent

Help someone find a small number of cheap, everyday foods that together meet a day's nutrient recommendations, or
check a day they've planned themselves, including vegetarians and vegans who want to be sure nothing is missing,
and shoppers at ordinary UK supermarkets. It is for thinking about food, not a medical tool.

## Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-11-17 | Code split into small modules: calculations in plain modules with tests, page code in `web/ui/` with one file per section (map in the README). No change in behaviour | Easier for people and AI to review; a rule can be found and checked in one place |
| 2026-11-17 | "Wider selection" preset: about 400 ordinary foods on top of the common list (`pipeline/wider_selection.json`; list in `data/foods/wider_selection.md`) | Variety without the odd picks of "Everything". The list is the maintainers' judgement, for the owner to review |
| 2026-11-17 | Mild preference for familiar foods in suggestions, capped at 1% of one target per plan; stated on the methods page | "Everything" picked dried lychees and bread sticks because the optimiser only sees nutrients |
| 2026-11-17 | When a long food list times out, also search the common foods and keep the better plan | A time-limited search over 400+ foods gave a worse plan than the common foods alone |
| 2026-11-17 | Vitamin D is reported on its own line and left out of the "targets met" count unless the visitor asks to plan for it | Otherwise almost every result read "short on vitamin D", burying shortfalls the plan was actually trying to avoid. Its amount, status and the supplement advice are still shown |
| 2026-11-17 | US-fortified products are flagged and left out of the "Everything" preset (still selectable one by one) | A UK shopper's version may not have the added nutrients, so a plan built on them could mislead |
| 2026-11-17 | Children: a warning (stronger under 5) and portion limits scaled by calories relative to a 2,000 kcal day. No minimum age | Adult portion caps gave toddler plans with 130 g of kale; the scaling is a rule of thumb and is labelled as one |
| 2026-11-17 | Suggestions leave out foods the NHS says a group should avoid (liver in pregnancy; shark, swordfish, marlin in pregnancy and under 16); the builder warns | The vitamin A limit alone only capped liver at about 30 g |
| 2026-11-17 | Suggestions don't chase vitamin D unless the visitor ticks a box (off by default); the day's vitamin D and the supplement notice are still shown | It forced 200–300 g of salmon or 200 g of UV mushrooms into most plans, against the 8 Nov decision below |
| 2026-11-17 | Oily fish (NHS list) share one cap of 140 g a day in suggestions | One plan had 430 g in a day beside a note giving the NHS weekly limits |
| 2026-11-17 | US saturated fat limit from the Dietary Guidelines (under 10% of calories, age 2+); no saturated fat limit under EU | The US tables have none; EFSA says "as low as possible" with no number, and borrowing a number would overstate what EFSA says |
| 2026-11-17 | Targets set as a share of energy are judged against each plan's own calories | A fixed gram amount lets a low-calorie plan exceed the percentage unnoticed |
| 2026-11-17 | Carbohydrate is USDA's "by difference" value minus fibre | Targets and food labels count carbohydrate without fibre |
| 2026-11-10 | Amino acid targets use the WHO safe level (Table 23 average + 24%, §8.4) | Matches the basis of every other target (covers nearly everyone) |
| 2026-11-10 | US calories use exact Dietary Guidelines Table A2-2 values for age and sex, band ±10% | The earlier secondary-source bands were inaccurate |
| 2026-11-09 | EU (EFSA) standard added alongside UK and US; other standards shown as thin outlines on charts, on by default, toggleable | Compare major standards without clutter |
| 2026-11-09 | Safety upper limits borrowed from the US tables for every standard, and said so | The UK and EU tables used give no complete set |
| 2026-11-09 | Diet defaults to "No restriction"; vegetarian and vegan are options | Most visitors aren't restricted |
| 2026-11-09 | Radar charts: food-label categories on top ("At a glance"), detail charts for vitamins, minerals, amino acids and fats in collapsibles, computed only when opened | Minimal by default; recognised categories |
| 2026-11-09 | Radar scale linear from 0, extending past 150% to fit; "Zoom to target" marks values beyond the edge | No misleading clipping |
| 2026-11-09 | Two modes: "Suggest foods for me" (optimiser) and "Build my own" (live update) | Both planning and checking |
| 2026-11-09 | Inputs reduced to sex, age and weight; standard, life stage, calories and target tweaks under "Fine-tune targets" | Simple by default |
| 2026-11-09 | ~116 curated common foods on by default; ~2,100 more from USDA, off by default, in a filterable hierarchy | Everyday foods first, more on request |
| 2026-11-08 | Vitamin D, B12, EPA/DHA and iodine shown as notices (sun/supplements, fortified foods, data gaps), not forced through food | Food alone often can't meet them sensibly; advice comes from the NHS |
| 2026-11-08 | Visitors can override any target; overridden values are marked as differing from the recommendation | Freedom without hiding the official value |
| 2026-11-08 | Food prices ignored for now | Price data isn't available reliably; possible later |
| 2026-11-08 | Optimiser: mixed-integer programme (HiGHS, in the browser) minimising total relative shortfall, never exceeding upper limits or the calorie band; practical amounts (10 g, half an egg, a slice) | Fewest foods, practical portions, transparent method |
| 2026-11-08 | Food data: local snapshot of USDA FoodData Central SR Legacy (public domain), refreshed quarterly | No UK dataset with comparable coverage and licence; resilience |

## Known gaps and ideas (not promises)

- How well nutrients are absorbed isn't modelled yet, for example iron from plants, phytates reducing zinc, or ALA
  converting to EPA and DHA.
- When "Everything" foods are on, the planner can pick unusual foods; preferring everyday foods could help.
- US fortification differs from the UK (for example milk with vitamin D), so fortified foods should be checked against
  their labels.
- Foundation Foods data could be added once USDA's download includes `food.csv` again.
