# Office to PDF: work in progress (branch `office-to-pdf`, NOT merged, NOT published)

State on 2026-11-16. Read `ROADMAP.md` on `main` first.

## What is here

- `pages/office.astro`, `web/office.ts`: the "Office to PDF" page.
- `public/sw.js`: service worker (scope `/tools/pdf-tools/`), installed only when the visitor clicks "Set up".
  It adds COOP/COEP (needed for the engine's shared memory; GitHub Pages can't send headers), adds the security
  policy as a header to every file (so it binds workers started from web addresses), and serves the two big
  engine files from gzip copies kept in Cache Storage.
- `tool.json` `vendor`/`vendorGzip` and `scripts/sync-data.mjs`: copy the engine from
  `node_modules/@matbee/libreoffice-converter` and publish `soffice.wasm`/`soffice.data` as `.gz`
  (147 MB + 100 MB -> 50 MB + 29 MB; whole site 88 MB).
- `web/privacy.test.ts`: checks for the service worker.

## What was measured (headless Chrome 153, 2 CPU cores)

- Engine served directly with real COOP/COEP headers and no policy (a throwaway test page): docx, xlsx and pptx
  each converted correctly in 1 to 3 seconds; no request left the machine.
- Through `sw.js` on a plain static server (as GitHub Pages serves): page becomes cross-origin isolated; engine
  files download once and are then served from cache; a worker under the service worker could not contact
  another site; the main PDF tools page still works; "Remove the converter" clears cache and worker.
- **Not reliable yet:** conversion through `sw.js` sometimes finishes in about 4 seconds and sometimes hangs at
  "Loading document..." for minutes. Cause not found. Do not publish until it is.

## Findings worth keeping

- The engine needs `'unsafe-eval'`; with the page's strict policy applied to its files it fails or never finishes
  starting. `sw.js` therefore gives the engine's own files a separate policy that still allows this site only.
- Violations inside the engine's nested workers do not show in the page console; bisect by changing the policy.
- Emscripten reads `soffice.data` with a streamed fetch; a missing Content-Length is fine.

## Next steps

1. Find the hang. Try: more CPU cores; the engine's policy removed entirely (isolating policy vs streaming);
   serving unpacked files through the worker; one file per run; the package's non-worker `BrowserConverter`.
2. Compare the other engines found (see `ROADMAP.md`), especially one that needs no cross-origin isolation.
3. Then: record results in `VERIFICATION.md`, add the engine and its licence (MPL-2.0, source link) to the methods
   page, update `DECISIONS.md`, and only then merge.
