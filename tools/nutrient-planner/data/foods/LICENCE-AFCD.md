# Australian Food Composition Database (AFCD): licence and required notices

`foods-afcd.json` and `foods-afcd-more.json` are a Derivative Work of the Australian Food Composition Database,
Release 3 (December 2025), published by Food Standards Australia New Zealand (FSANZ). The AFCD values inside
`foods-blend.json` and `foods-blend-values.json` (the Blended table) are also derived from it.

Changes made: values converted to the planner's units (energy from kJ at 4.184 kJ/kcal; amino acids and EPA/DHA from
mg to g), nutrients chosen and renamed, foods classified, and, in the Blended table, combined with values from other
food composition tables. See `pipeline/tables/afcd.py` and `pipeline/blend/blend_all.py`.

These derived files are distributed under the FSANZ Data User Licence Agreement for the Food Composition Databases,
a licence based on Creative Commons Attribution-ShareAlike 3.0 Australia:
https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement

© Food Standards Australia New Zealand. Attribution does not suggest that FSANZ endorses this site or its use of
the data.

**Limitation of Data Statement** (from the licence agreement): There are limitations associated with food
composition databases. Food composition data used in the database or databases may represent an average of the
nutrient content of a particular sample of foods and ingredients, determined at a particular time. The nutrient
composition of foods and ingredients can vary substantially between batches and brands because of a number of
factors, including changes in season, processing practices and ingredient source, and methods of calculation.

**Australian data:** this Work is based on Australian data, and Australian data may not be appropriate for use in
other countries.
