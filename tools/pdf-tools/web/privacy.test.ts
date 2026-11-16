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
  for (const f of [...read("web"), ...read("pages"), ...read("components")]) {
    const hit = SENDERS.exec(f.text);
    assert.equal(hit, null, `${f.name} contains "${hit?.[0]}"`);
  }
});

test("pdf-tools: its pages load nothing from other sites", () => {
  for (const f of [...read("pages"), ...read("components")]) {
    const hit = /(?:src|action|srcset|poster)\s*=\s*["'{`]\s*(?:https?:)?\/\/|<link[^>]+href\s*=\s*["'](?:https?:)?\/\/|<form\b|<iframe\b|<object\b|<embed\b/i.exec(f.text);
    assert.equal(hit, null, `${f.name} contains "${hit?.[0]}"`);
  }
});

test("pdf-tools: the tool page sets a browser security policy that blocks connections to other sites", () => {
  // Every page that handles files is either the shared task page (which sets the policy in the document head)
  // or a one-line page that uses it.
  const task = readFileSync(join(DIR, "components", "Task.astro"), "utf8");
  assert.match(task, /<meta slot="head" http-equiv="Content-Security-Policy" content=\{policy\} \/>/);
  assert.match(task, /const policy = import\.meta\.env\.PROD \? CSP : "";/);
  for (const f of read("pages")) {
    if (f.name === "pages/methods.astro") continue;
    assert.ok(/http-equiv="Content-Security-Policy"/.test(f.text) || /<Task task="[a-z-]+" \/>/.test(f.text), `${f.name} must set the security policy`);
  }
  const csp = /export const CSP\s*=\s*\[([\s\S]*?)\]\.join/.exec(readFileSync(join(DIR, "web", "csp.ts"), "utf8"))?.[1] ?? "";
  for (const rule of ["default-src 'self'", "connect-src 'self'", "form-action 'none'", "object-src 'none'", "frame-src 'none'"]) assert.ok(csp.includes(rule), `policy is missing: ${rule}`);
  assert.doesNotMatch(csp, /https?:|\*/, "the policy must not allow any other site");
});

test("pdf-tools: background workers are started from memory, so the security policy binds them", () => {
  // Measured in Chrome on 2026-11-16: a worker started from a web address ignored the page's policy and could
  // contact another site; a worker started from a blob (code held in the page) was blocked.
  for (const f of read("web")) {
    assert.doesNotMatch(f.text, /workerSrc|\?worker\b|\?url["']/, `${f.name} must not start a worker from a web address`);
    for (const m of f.text.matchAll(/new\s+(?:Shared)?Worker\s*\(([^)]*)/g)) assert.match(m[1], /createObjectURL/, `${f.name}: start workers from a blob`);
  }
});
