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

  // Archived copies are required for tools whose information people act on for their health ("archive" absent or
  // "required" in tool.json); a utility tool can set "archive": "optional" (docs/PRINCIPLES.md, principle 3).
  test(`${slug}: every citation is in the reference list, and every reference has an archived copy where the tool needs one`, () => {
    const refsPath = join(dir, "references.json");
    if (!existsSync(refsPath)) return;
    const refs = json(refsPath).sources as { id: string; archive: { asset?: string; release?: string }[] }[];
    const ids = refs.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate reference ids");
    const code = walk(dir).filter((f) => /\.(astro|ts)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    const cited = new Set([...code.matchAll(/cite\(\s*"([^"]+)"/g)].map((m) => m[1]));
    for (const c of cited) assert.ok(ids.includes(c), `cites unknown reference "${c}"`);
    if (template) return;
    const optional = json(join(dir, "tool.json")).archive === "optional";
    for (const r of refs) {
      if (!optional) assert.ok(r.archive.length, `${r.id} has no archived copy`);
      else if (!r.archive.length) assert.match(String((r as { accessed?: string }).accessed), /^\d{4}-\d{2}-\d{2}$/, `${r.id}: a source without an archived copy needs "accessed" (the date it was read)`);
      for (const a of r.archive) assert.ok(a.asset || a.release, `${r.id}: archived copies are release files ({"asset": ...})`);
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

// Reference files (PDFs, spreadsheets, datasets, saved web pages) are kept in the source-archive release, never
// committed: anything committed stays in the repository's history for good. See sources/README.md.
test("no reference files are committed to the repository", () => {
  for (const f of walk(join(ROOT, "sources")))
    assert.ok(/\/sources\/(README\.md|[^/]+\.json)$/.test(f.replaceAll("\\", "/")),
      `${f.slice(ROOT.length)}: don't commit reference files; list it in sources/archive.json and attach it to the source-archive release`);
  const skip = new Set(["node_modules", "dist", "sources"]);
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    if (f.startsWith(".") || skip.has(f)) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
  const kind = /\.(pdf|xlsx?|xlsm|ods|docx?|odt|zip|7z|gz|tar|xml|csv|tsv|mht(ml)?|html?|epub)$/i;
  // Our own hand-reviewable tables (food descriptions and matching decisions) are CSV by design.
  const ours = /[\\/]tools[\\/][^\\/]+[\\/]pipeline[\\/]blend[\\/].*\.csv$/;
  // site/public/tools/ is filled at build time from the tools' data and installed packages (scripts/sync-data.mjs)
  // and is never committed; skipping it is only safe while .gitignore keeps it out.
  assert.match(readFileSync(join(ROOT, ".gitignore"), "utf8"), /^site\/public\/tools\/$/m, "site/public/tools/ must stay git-ignored");
  const built = join(ROOT, "site", "public", "tools");
  for (const f of files(ROOT).filter((f) => !f.startsWith(built)))
    assert.ok(!kind.test(f) || ours.test(f), `${f.slice(ROOT.length)}: reference files go in the source-archive release, not the repository`);
});
