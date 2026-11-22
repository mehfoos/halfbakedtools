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
- **Sources:** every reference has an access date and an owner's private copy (recorded by file name and checksum
  only); some also have a public copy in the `source-archive` release, never committed (principle 3 in
  `AGENTS.md`). An editor checks a public copy and lists it in `sources/archive.json`; the owner attaches it to
  the release by hand (*Releases* -> *Source archive* -> *Edit*). See `sources/README.md`. The tests fail if a
  reference is incomplete or a reference file is committed.
- **Link check** (`link-check.yml`) runs every three months (and on demand from the Actions tab), and opens or
  updates an issue labelled `link-check` listing links that fail. It changes no files.
- **Tool data jobs** are named `<slug>-*.yml` and described in the tool's README.
