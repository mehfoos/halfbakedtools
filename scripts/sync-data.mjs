// Copies each tool's published data (tools/<slug>/data/**/*.json) into
// site/public/tools/<slug>/data/ so the browser can load it.
// A tool may also list "vendor" folders in its tool.json, e.g. { "pdfjs/cmaps": "pdfjs-dist/cmaps" }:
// node_modules/pdfjs-dist/cmaps is then served from /tools/<slug>/vendor/pdfjs/cmaps/. This is for
// library files that must be loaded by address at run time; they are served from this site, never a CDN.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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
  if (slug.startsWith("_")) continue;
  const metaPath = join(root, "tools", slug, "tool.json");
  const vendor = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")).vendor ?? {} : {};
  for (const [to, from] of Object.entries(vendor)) {
    if (/(^|[\\/])\.\.([\\/]|$)/.test(to) || /(^|[\\/])\.\.([\\/]|$)/.test(from)) throw new Error(`${slug}: vendor paths must not contain ".."`);
    cpSync(join(root, "node_modules", from), join(outRoot, slug, "vendor", to), { recursive: true });
    console.log(`Copied ${from} for ${slug}`);
  }
  if (!existsSync(data)) continue;
  const files = walk(data).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const out = join(outRoot, slug, "data", relative(data, f));
    mkdirSync(dirname(out), { recursive: true });
    cpSync(f, out);
  }
  console.log(`Synced ${files.length} data files for ${slug}`);
}
