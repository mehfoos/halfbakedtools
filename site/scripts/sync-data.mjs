// Copies the repo's data snapshot into site/public/data so the website can load it.
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const site = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = join(site, "..", "data");
const out = join(site, "public", "data");
mkdirSync(out, { recursive: true });

for (const f of readdirSync(join(data, "targets")).filter((f) => f.endsWith(".json"))) {
  cpSync(join(data, "targets", f), join(out, "targets-" + f));
}
const foods = join(data, "foods", "foods.json");
if (existsSync(foods)) cpSync(foods, join(out, "foods.json"));
else writeFileSync(join(out, "foods.json"), JSON.stringify({ missing: true, foods: [], nutrients: [] }));
const meta = join(data, "meta.json");
writeFileSync(join(out, "meta.json"), existsSync(meta) ? (await import("node:fs")).readFileSync(meta) : "{}");
console.log("Synced data into public/data" + (existsSync(foods) ? "" : " (no food snapshot yet)"));
