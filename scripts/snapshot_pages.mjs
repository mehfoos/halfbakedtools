#!/usr/bin/env node
// Save web pages as single-file MHTML snapshots with headless Chrome, for owner's copies (sources/README.md).
//
// Usage: node scripts/snapshot_pages.mjs LIST.tsv OUT_DIR
//   LIST.tsv: one page per line, "<file name>\t<url>" (file names end in .mht; lines starting with # are skipped).
//   OUT_DIR:  where the .mht files and manifest.json go. Keep it outside the repository: reference files are never
//             committed (principle 3 in AGENTS.md).
//
// Chrome is found at $CHROME or google-chrome; $HTTPS_PROXY is passed on if set. The browser identifies itself as
// headless Chrome, unchanged. A page that answers with an error (403, 429, ...) is reported as failed and not
// retried: if a site blocks downloads, ask the owner to save it by hand (AGENTS.md, principle 3).
// manifest.json records, per page: file, url, finalUrl, status, title, retrieved (UTC), bytes, sha256.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [listFile, outDir] = process.argv.slice(2);
if (!listFile || !outDir) { console.error('Usage: node scripts/snapshot_pages.mjs LIST.tsv OUT_DIR'); process.exit(2); }
const pages = readFileSync(listFile, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => { const [file, url] = l.split('\t'); return { file, url }; });
for (const p of pages) if (!p.file?.endsWith('.mht') || !/^https:\/\//.test(p.url ?? '')) {
  console.error(`Bad line: ${p.file} ${p.url}`); process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const port = 9400 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'snap-'));
const args = ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`, 'about:blank'];
if (process.getuid?.() === 0) args.unshift('--no-sandbox');
if (process.env.HTTPS_PROXY) args.unshift(`--proxy-server=${process.env.HTTPS_PROXY}`);
const chrome = spawn(process.env.CHROME || 'google-chrome', args, { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function browserWs() {
  for (let i = 0; i < 40; i++) {
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { await sleep(250); }
  }
  throw new Error('Chrome did not start');
}

function connect(url) {
  const ws = new WebSocket(url); let id = 0; const waiting = new Map(); const listeners = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { const { ok, fail } = waiting.get(m.id); waiting.delete(m.id); m.error ? fail(new Error(m.error.message)) : ok(m.result); }
    else for (const f of listeners) f(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const msg = { id: ++id, method, params }; if (sessionId) msg.sessionId = sessionId;
    waiting.set(msg.id, { ok, fail }); ws.send(JSON.stringify(msg));
  });
  return new Promise(r => { ws.onopen = () => r({ send, on: f => listeners.push(f), close: () => ws.close() }); });
}

async function snapshot(cdp, page) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  let status = null, finalUrl = page.url, loaded = false;
  cdp.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Network.responseReceived' && m.params.type === 'Document' && status === null) {
      status = m.params.response.status; finalUrl = m.params.response.url;
    }
    if (m.method === 'Network.responseReceived' && m.params.type === 'Document' && m.params.response.url === finalUrl) status = m.params.response.status;
    if (m.method === 'Page.loadEventFired') loaded = true;
  });
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Page.navigate', { url: page.url }, sessionId);
  for (let i = 0; i < 120 && !loaded; i++) await sleep(250);
  await sleep(3000); // let late content and pictures arrive
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true }, sessionId);
  const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' }, sessionId);
  await cdp.send('Target.closeTarget', { targetId });
  const buf = Buffer.from(data, 'utf8');
  const entry = { file: page.file, url: page.url, finalUrl, status, title: result.value, loaded,
    retrieved: new Date().toISOString(), bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  if (status !== null && status < 400) writeFileSync(join(outDir, page.file), buf);
  else entry.failed = `HTTP ${status}: not saved; ask the owner to save it by hand`;
  return entry;
}

const manifest = [];
try {
  const cdp = await connect(await browserWs());
  for (const p of pages) {
    try { const e = await snapshot(cdp, p); manifest.push(e); console.log(`${e.failed ? 'FAILED' : 'saved '} ${p.file} ${e.status} ${e.bytes} bytes ${e.title ?? ''}`); }
    catch (err) { manifest.push({ file: p.file, url: p.url, failed: String(err) }); console.log(`FAILED ${p.file} ${err}`); }
  }
  cdp.close();
} finally {
  chrome.kill(); await sleep(500); rmSync(profile, { recursive: true, force: true });
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
process.exitCode = manifest.some(m => m.failed) ? 1 : 0;
