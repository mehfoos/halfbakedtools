# Setting up the repository on GitHub

1. **Create the repo** (e.g. `halfbakedtools`) and push this folder to its `main` branch.
2. **Enable Pages:** Settings → Pages → Source: **GitHub Actions**.
3. **Create the label** `data-refresh` (Issues → Labels → New label). The website's "Request a data refresh" button opens an issue with this label.
4. **Build the first food snapshot:** Actions → *Refresh food data* → Run workflow. This downloads USDA data, commits `data/foods/`, archives the raw files as a release, and deploys the site. Then read `data/foods/match_report.md` to check each food matched the USDA record you'd expect; fix any in `data/pipeline/foods_catalogue.json` and run the workflow again with *force* ticked.
5. **Custom domain:** Settings → Pages → Custom domain → `halfbakedtools.com`, then at your registrar add the DNS records GitHub shows (A records for the apex domain, and a CNAME for `www`). Tick *Enforce HTTPS* once the certificate is issued.
   - To use the github.io address instead, set repository variables `SITE_URL` (e.g. `https://yourname.github.io`) and `SITE_BASE` (e.g. `/halfbakedtools/`).

## Ongoing

- The data refreshes automatically on 1 Jan, Apr, Jul and Oct. Refresh requests from the site are honoured only when the snapshot is at least 90 days old; maintainers can always run the workflow manually with *force*.
- Targets are transcribed in `data/pipeline/build_targets.py` with their sources; edit there, not in the generated JSON.
- Adding a tool: create `site/src/tools/<name>/` for its code and `site/src/pages/tools/<name>/index.astro` for its page, and add it to the home page list.
