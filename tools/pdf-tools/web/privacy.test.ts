// Guards the tool's central promise: files are processed in the browser and never sent anywhere.
// These checks fail the build if this tool's own code gains a way to send data, or loses its browser
// security policy. (The libraries it uses are covered by that policy, not by this scan.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("..", import.meta.url));
const read = (sub: string) => readdirSync(join(DIR, sub)).filter((f) => !f.endsWith(".test.ts")).map((f) => ({ name: `${sub}/${f}`, text: readFileSync(join(DIR, sub, f), "utf8") }));

const SENDERS = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|RTCPeerConnection|RTCDataChannel|WebTransport|\.submit\s*\(|\bimportScripts\b|serviceWorker/;

test("pdf-tools: its code has no way of sending data over the network", () => {
  for (const f of [...read("web"), ...read("pages")]) {
    // office.ts alone may install the service worker (public/sw.js, checked below); nothing else may mention one.
    const text = f.name === "web/office.ts" ? f.text.replace(/serviceWorker/g, "") : f.text;
    const hit = SENDERS.exec(text);
    assert.equal(hit, null, `${f.name} contains "${hit?.[0]}"`);
  }
});

test("pdf-tools: its pages load nothing from other sites", () => {
  for (const f of read("pages")) {
    const hit = /(?:src|action|srcset|poster)\s*=\s*["'{`]\s*(?:https?:)?\/\/|<link[^>]+href\s*=\s*["'](?:https?:)?\/\/|<form\b|<iframe\b|<object\b|<embed\b/i.exec(f.text);
    assert.equal(hit, null, `${f.name} contains "${hit?.[0]}"`);
  }
});

test("pdf-tools: the tool page sets a browser security policy that blocks connections to other sites", () => {
  const page = readFileSync(join(DIR, "pages", "index.astro"), "utf8");
  assert.match(readFileSync(join(DIR, "pages", "office.astro"), "utf8"), /http-equiv="Content-Security-Policy"/);
  const csp = /export const CSP\s*=\s*\[([\s\S]*?)\]\.join/.exec(readFileSync(join(DIR, "web", "csp.ts"), "utf8"))?.[1] ?? "";
  assert.match(page, /http-equiv="Content-Security-Policy"/);
  assert.match(page, /slot="head"/);
  for (const rule of ["default-src 'self'", "connect-src 'self'", "form-action 'none'", "object-src 'none'", "frame-src 'none'"]) assert.ok(csp.includes(rule), `policy is missing: ${rule}`);
  assert.doesNotMatch(csp, /https?:|\*/, "the policy must not allow any other site");
});

test("pdf-tools: background workers are started from memory, so the security policy binds them", () => {
  // Measured in Chrome on 2026-11-16: a worker started from a web address ignored the page's policy and could
  // contact another site; a worker started from a blob (code held in the page) was blocked.
  for (const f of read("web")) {
    assert.doesNotMatch(f.text, /workerSrc|\?worker\b|\?url["']/, `${f.name} must not start a worker from a web address`);
    if (f.name === "web/office.ts") continue; // its engine's workers get the policy as a header from sw.js instead
    for (const m of f.text.matchAll(/new\s+(?:Shared)?Worker\s*\(([^)]*)/g)) assert.match(m[1], /createObjectURL/, `${f.name}: start workers from a blob`);
  }
});

test("pdf-tools: the service worker only talks to this site and adds the security policy to every file", () => {
  const sw = readFileSync(join(DIR, "public", "sw.js"), "utf8");
  const code = sw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.doesNotMatch(code.replace(/const ENGINE_POLICY = "[^"]+";/, ""), /https?:|\/\/[a-z0-9.-]+\.[a-z]{2,}/i, "sw.js must not name any web address");
  assert.doesNotMatch(code, /XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|postMessage/, "sw.js must not use other ways of sending data");
  assert.match(code, /if \(url\.origin !== self\.location\.origin\) \{ event\.respondWith\(Response\.error\(\)\); return; \}/, "requests to other sites must be refused");
  assert.equal([...code.matchAll(/\bfetch\(/g)].length, 2, "sw.js fetches in exactly two places: the request as asked, and the packed engine file");
  for (const h of ["Content-Security-Policy", "Cross-Origin-Opener-Policy", "Cross-Origin-Embedder-Policy"]) assert.ok(code.includes(`headers.set("${h}"`), `sw.js must set ${h}`);
  const engine = /const ENGINE_POLICY = "([^"]+)"/.exec(sw)?.[1] ?? "";
  assert.ok(engine.startsWith("default-src 'self' blob: data: ") && engine.includes("connect-src 'self' blob: data:"), "the engine's policy must limit everything to this site");
  assert.doesNotMatch(engine, /https?:|wss?:|\*/, "the engine's policy must not allow any other site");
  const office = readFileSync(join(DIR, "web", "office.ts"), "utf8");
  assert.match(office, /csp=\$\{encodeURIComponent\(CSP\)\}/, "office.ts must hand the policy to the service worker");
  assert.match(office, /const ready = \(\) => !!sw\?\.controller && self\.crossOriginIsolated === true;/, "the engine must not start without the service worker");
  assert.match(office, /if \(!ready\(\)\) throw/);
});
