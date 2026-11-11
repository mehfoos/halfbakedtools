// Copies each tool's published data (tools/<slug>/data/**/*.json) into
// site/public/tools/<slug>/data/ so the browser can load it.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "site", "public", "tools");
rmSync(outRoot, { recursive: true, force: true });

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

for (const slug of readdirSync(join(root, "tools"))) {
  const data = join(root, "tools", slug, "data");
  if (slug.startsWith("_") || !existsSync(data)) continue;
  const files = walk(data).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const out = join(outRoot, slug, "data", relative(data, f));
    mkdirSync(dirname(out), { recursive: true });
    cpSync(f, out);
  }
  console.log(`Synced ${files.length} data files for ${slug}`);
}
