// Checks every tool folder follows the conventions in AGENTS.md ("Adding a tool"), and that every
// reference follows the three-layer rule (AGENTS.md, principle 3).
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

  // Every source: a public reference with an access date, the owner's private copy, and either a public copy in the
  // source-archive release or a stated reason for not having one (AGENTS.md, principle 3).
  test(`${slug}: every citation is in the reference list, and every reference follows the three-layer rule`, () => {
    const refsPath = join(dir, "references.json");
    if (!existsSync(refsPath)) return;
    type Ref = { id: string; url: string; accessed?: string | null; archive: { asset?: string; release?: string }[];
      noPublicCopy?: { why: string; note: string }; ownerCopy?: { file: string; sha256?: string; pending?: boolean }[] | string };
    const refs = json(refsPath).sources as Ref[];
    const ids = refs.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate reference ids");
    const code = walk(dir).filter((f) => /\.(astro|ts)$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
    const cited = new Set([...code.matchAll(/cite\(\s*"([^"]+)"/g)].map((m) => m[1]));
    for (const c of cited) assert.ok(ids.includes(c), `cites unknown reference "${c}"`);
    const health = json(join(dir, "tool.json")).health;
    assert.equal(typeof health, "boolean", 'tool.json needs "health": true or false (does it give health information?)');
    for (const r of refs) {
      assert.match(r.url, /^https:\/\//, `${r.id}: needs an https link to the original`);
      // Layer 1: when the original was last read and checked. null is allowed only for entries older than this rule,
      // and only until they are re-checked; a new reference always has a date.
      assert.ok("accessed" in r, `${r.id}: needs "accessed" (ISO date the original was last read)`);
      if (r.accessed !== null) assert.match(String(r.accessed), /^\d{4}-\d{2}-\d{2}$/, `${r.id}: "accessed" must be an ISO date`);
      // Layer 2: the owner's private copy, recorded by file name (and checksum) only.
      assert.ok(r.ownerCopy === "pending" || Array.isArray(r.ownerCopy) && r.ownerCopy.length,
        `${r.id}: needs "ownerCopy": [{"file": ..., "sha256": ...}] or "pending"`);
      if (Array.isArray(r.ownerCopy)) for (const c of r.ownerCopy) {
        assert.ok(c.file && !/[\/\\]|drive\.google|docs\.google/i.test(c.file), `${r.id}: ownerCopy gives a file name only, never a location`);
        if (c.sha256) assert.match(c.sha256, /^[0-9a-f]{64}$/, `${r.id}: ${c.file} sha256`);
        assert.ok(!registry.has(c.file) || !r.noPublicCopy || r.noPublicCopy.why !== "licence",
          `${r.id}: ${c.file} can't be redistributed, so it must not be in sources/archive.json`);
      }
      assert.ok(!JSON.stringify(r).match(/drive\.google|docs\.google/), `${r.id}: never record where the owner's copies are stored`);
      // Layer 3: a public copy, or the reason there isn't one.
      for (const a of r.archive) assert.ok(a.asset || a.release, `${r.id}: public copies are release files ({"asset": ...})`);
      for (const a of r.archive) if (a.asset && !template) assert.ok(registry.has(a.asset), `${r.id}: ${a.asset} is not listed in sources/archive.json`);
      if (!r.archive.length) {
        assert.ok(r.noPublicCopy, `${r.id}: has no public copy, so it needs "noPublicCopy": {"why": ..., "note": ...}`);
        assert.ok(["not-data", "licence", "easy-to-get"].includes(r.noPublicCopy!.why), `${r.id}: noPublicCopy.why`);
        assert.ok(r.noPublicCopy!.note, `${r.id}: noPublicCopy needs a note`);
        assert.ok(!(health && r.noPublicCopy!.why === "easy-to-get"),
          `${r.id}: in a health tool, a source the results depend on needs a public copy even if it is easy to get`);
      } else assert.ok(!r.noPublicCopy, `${r.id}: has a public copy and a "noPublicCopy" reason; keep one`);
    }
  });

  // Every tool records its method in full on a methods page (AGENTS.md, principle 3).
  test(`${slug}: has a methods page`, () => {
    const pages = json(join(dir, "tool.json")).pages.map((p: { page: string }) => p.page);
    assert.ok(pages.includes("methods"), "every tool needs a pages/methods.astro page recording its full method");
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
