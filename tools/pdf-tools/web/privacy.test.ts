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
    const hit = SENDERS.exec(f.text);
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
  const csp = /export const CSP\s*=\s*\[([\s\S]*?)\]\.join/.exec(readFileSync(join(DIR, "web", "csp.ts"), "utf8"))?.[1] ?? "";
  assert.match(page, /http-equiv="Content-Security-Policy"/);
  assert.match(page, /slot="head"/);
  for (const rule of ["default-src 'self'", "connect-src 'self'", "form-action 'none'", "object-src 'none'", "frame-src 'none'"]) assert.ok(csp.includes(rule), `policy is missing: ${rule}`);
  assert.doesNotMatch(csp, /https?:|\*/, "the policy must not allow any other site");
});
