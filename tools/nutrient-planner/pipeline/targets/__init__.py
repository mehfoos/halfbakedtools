"""Reference intake tables for the nutrient planner, one module per standard.

  common.py  output format, shared helpers, WHO amino acids (used by every standard)
  uk.py      Public Health England (2016)
  us.py      National Academies DRIs and Dietary Guidelines for Americans 2020-2025
             (its upper limits are also borrowed by the UK and EU)
  eu.py      EFSA (2017) summary report and EFSA (2019) sodium

Each table is copied from the cited document, with the table and page beside it, so it can be
checked line by line against the archived copy in sources/. Run ../build_targets.py to write the JSON.
"""
