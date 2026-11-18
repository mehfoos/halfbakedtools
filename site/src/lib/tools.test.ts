// Checks every tool folder follows the conventions in docs/ADDING_A_TOOL.md, and that every
// reference has an archived copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TOOLS = join(ROOT, "tools");
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const manifest = json(join(ROOT, "sources", "manifest.json"));
const registry = new Set((json(join(ROOT, "sources", "archive.json")).files as { file: string }[]).map((f) => f.file));
const folders = readdirSync(TOOLS).filter((d) => statSync(join(TOOLS, d)).isDirectory());
const walk = (dir: string): string[] => !existsSync(dir) ? [] : readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

for (const slug of folders) {
  const dir = join(TOOLS, slug);
  const template = slug.startsWith("_");

  test(`${slug}: has README, DECISIONS and VERIFICATION files`, () => {
    for (const f of ["README.md", "DECISIONS.md", "VERIFICATION.md"]) assert.ok(existsSync(join(dir, f)), `missing ${f}`);
  });

  test(`${slug}: tool.json is complete and matches its pages`, () => {
    const t = json(join(dir, "tool.json"));
    if (!template) assert.equal(t.slug, slug);
    for (const k of ["name", "summary", "topic", "status", "added", "pages"]) assert.ok(t[k], `missing ${k}`);
    assert.ok(["alpha", "beta", "stable"].includes(t.status), `status ${t.status}`);
    const files = readdirSync(join(dir, "pages")).filter((f) => f.endsWith(".astro")).map((f) => f.replace(/\.astro$/, ""));
    assert.deepEqual([...t.pages.map((p: { page: string }) => p.page)].sort(), files.sort(), "tool.json pages must list exactly the files in pages/");
    assert.equal(t.pages[0].page, "index", "the first page must be index");
  });

  test(`${slug}: every citation is in the reference list, and every reference has an archived copy`, () => {
    const refsPath = join(dir, "references.json");
    if (!existsSync(refsPath)) return;
    const refs = json(refsPath).sources as { id: string; archive: { file?: string; asset?: string; release?: string }[] }[];
    const ids = refs.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate reference ids");
    const code = walk(dir).filter((f) => /\.(astro|ts)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    const cited = new Set([...code.matchAll(/cite\(\s*"([^"]+)"/g)].map((m) => m[1]));
    for (const c of cited) assert.ok(ids.includes(c), `cites unknown reference "${c}"`);
    if (template) return;
    for (const r of refs) {
      assert.ok(r.archive.length, `${r.id} has no archived copy`);
      for (const a of r.archive) if (a.file) assert.ok(manifest[a.file]?.sha256, `${r.id}: sources/${a.file} missing (run the Archive sources workflow or upload it)`);
      // A release copy must be in the registry; until the workflow has verified it, the page says it isn't available yet.
      for (const a of r.archive) if (a.asset) assert.ok(registry.has(a.asset), `${r.id}: ${a.asset} is not listed in sources/archive.json`);
    }
  });
}

test("source archive registry: each file has a way in and a checksum or zip parts; names are unique", () => {
  const reg = json(join(ROOT, "sources", "archive.json"));
  const names = reg.files.map((f: { file: string }) => f.file);
  assert.equal(new Set(names).size, names.length, "duplicate file names in sources/archive.json");
  for (const f of reg.files) {
    assert.ok(f.fetch || f.zip || f.manual, `${f.file}: needs 'fetch', 'zip' or 'manual'`);
    assert.ok(f.licence && f.publisher, `${f.file}: needs licence and publisher`);
    if (f.zip) for (const m of f.zip) assert.match(m.sha256, /^[0-9a-f]{64}$/, `${f.file}: ${m.name} needs a sha256`);
    else assert.match(f.sha256 ?? "", /^[0-9a-f]{64}$/, `${f.file}: needs the sha256 of the checked copy`);
  }
});
