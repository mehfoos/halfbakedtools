// Data caveats keep one style: the kinds are defined once (caveats.ts, with a JSON copy for the Python
// pipeline), rendered by caveat() or <Caveat>, and never written by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { KINDS, caveat } from "./caveats.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

test("the pipeline's copy of the caveat kinds matches", () => {
  const json = JSON.parse(readFileSync(join(ROOT, "site/src/lib/caveats.json"), "utf8"));
  assert.deepEqual(json.kinds, KINDS);
});

test("caveat() renders the label and the kind", () => {
  const html = caveat("assumption", "Text.", { id: "x", hidden: true });
  assert.equal(html, `<p class="notice caveat small" data-caveat="assumption" id="x" hidden><span class="caveat-kind" ` +
    `title="${KINDS.assumption.meaning}">Assumption</span> Text.</p>`);
});

test("the Astro component uses the same markup", () => {
  const astro = readFileSync(join(ROOT, "site/src/components/Caveat.astro"), "utf8");
  for (const s of ['"notice", "caveat"', "data-caveat={kind}", 'class="caveat-kind"', "title={k.meaning}", "{k.label}"])
    assert.ok(astro.includes(s), s);
});

test("no data disclaimer is written by hand", () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    if (f.startsWith(".") || ["node_modules", "dist"].includes(f)) return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(astro|ts)$/.test(f) && !f.endsWith(".test.ts") ? [p] : [];
  });
  const handWritten = /class="notice[^"]*"[^>]*>\s*(Early version|Alpha\b|Beta\b|Estimate\b|Assumption\b)|\((alpha|beta)\)/i;
  for (const f of [...files(join(ROOT, "tools")), ...files(join(ROOT, "site/src"))])
    assert.ok(!handWritten.test(readFileSync(f, "utf8")), `${f.slice(ROOT.length)}: use caveat() or <Caveat>`);
});
