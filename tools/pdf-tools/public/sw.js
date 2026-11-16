// Service worker for the PDF tools' "Office to PDF" page. It runs in the visitor's browser, only for pages under
// /tools/pdf-tools/, and is installed only when the visitor chooses to set up the converter.
//
// It does three things, all with files from this site only:
//  1. Adds two headers (COOP/COEP) that the LibreOffice engine needs before a browser lets it use shared memory.
//     GitHub Pages, which hosts this site, cannot send them.
//  2. Adds the tool's security policy (Content-Security-Policy) as a header to every file, so that it also binds
//     the engine's background workers, which a policy written in the page alone would not.
//  3. Serves the two large engine files from compressed copies, kept in this browser's cache after the first
//     download so they are not downloaded again.
//
// It never contacts another site: requests to other origins are refused outright (the security policy blocks them
// before they get here in any case). It never sees the visitor's documents: those are read by the page, not requested.
const params = new URL(self.location.href).searchParams;
const POLICY = params.get("csp") || "default-src 'self'";
const CACHE = `pdf-tools-office-engine-${params.get("v") || "0"}`;
// The LibreOffice engine's own files get a policy of their own. The engine builds some of its code while it runs
// and starts helper threads in ways the page's stricter policy stops (measured: with the page's policy the
// engine never finishes starting). This one still names no other site: everything, connections included, is
// limited to this site ('self') and to content made inside the browser (blob:, data:).
const ENGINE_POLICY = "default-src 'self' blob: data: 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' blob: data:; form-action 'none'; object-src 'none'; frame-src 'none'";
const ENGINE_PATH = /\/vendor\/lo(-worker)?\//;
const ENGINE_FILE = /\/vendor\/lo\/soffice\.(wasm|data)$/;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith("pdf-tools-office-engine-") && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) { event.respondWith(Response.error()); return; }
  event.respondWith(respond(event.request, url));
});

async function respond(request, url) {
  const response = ENGINE_FILE.test(url.pathname) ? await engineFile(url) : await self.fetch(request);
  if (response.status === 0 || response.status === 304 || response.type === "opaqueredirect") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Content-Security-Policy", ENGINE_PATH.test(url.pathname) ? ENGINE_POLICY : POLICY);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// soffice.wasm and soffice.data are published as .gz files; unpack them on the way to the page.
async function engineFile(url) {
  const packed = `${url.origin}${url.pathname}.gz`;
  const cache = await caches.open(CACHE);
  let response = await cache.match(packed);
  if (!response) {
    response = await self.fetch(packed);
    if (!response.ok) return response;
    await cache.put(packed, response.clone());
  }
  const type = url.pathname.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip")), { headers: { "Content-Type": type } });
}
