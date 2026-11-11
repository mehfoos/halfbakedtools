# Setting up the repository on GitHub

1. **Create the repo** (e.g. `halfbakedtools`) and push this folder to its `main` branch.
2. **Enable Pages:** Settings → Pages → Source: **GitHub Actions**.
3. **Custom domain:** Settings → Pages → Custom domain → `halfbakedtools.com`, then at your registrar add the DNS
   records GitHub shows (A and AAAA records for the apex domain, and a CNAME for `www`). Tick *Enforce HTTPS* once
   the certificate is issued.
   - To use the github.io address instead, set repository variables `SITE_URL` (e.g. `https://yourname.github.io`)
     and `SITE_BASE` (e.g. `/halfbakedtools/`).
4. **Per-tool setup:** follow the "First-time setup" section of each tool's README
   (for example [`tools/nutrient-planner/README.md`](../tools/nutrient-planner/README.md)).

## Ongoing

- **Deploys** run on every push to `main` that touches the site, a tool, the sources or the build config.
  The build runs every test first; a failing test stops the deploy.
- **Archived sources:** when a tool's `references.json` changes on `main`, the *Archive sources* workflow fetches any
  missing copies into `sources/`. Some publishers block automated downloads (the WHO, for example); the workflow log
  lists those, and they can be downloaded by hand and committed with the file name given in `references.json`.
  The tests fail until every reference has an archived copy.
- **Tool data jobs** are named `<slug>-*.yml` and described in the tool's README.
