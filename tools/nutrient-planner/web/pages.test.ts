// Food Finder must stay a mirror of the Planner: both pages are built from the same parts, and neither keeps a copy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = (name: string) => readFileSync(new URL(`../pages/${name}.astro`, import.meta.url), "utf8");

for (const name of ["index", "planner"]) {
  test(`${name}.astro is built from the shared parts`, () => {
    const s = page(name);
    for (const part of ["YouFields", "FoodList", "ShareBox"]) assert.ok(s.includes(`<${part}`), `${name} uses <${part}>`);
    assert.ok(s.includes('import "../web/ui/page.css"'), `${name} uses the shared styles`);
    assert.ok(!/<style/.test(s), `${name} has no styles of its own (put them in web/ui/page.css)`);
    for (const id of ['id="foodTree"', 'id="targetGroups"', 'id="rememberBox"']) assert.ok(!s.includes(id), `${name} doesn't copy ${id}`);
  });
}

test("Food Finder uses the single-pick food list and its own start-up", () => {
  const s = page("index");
  assert.ok(s.includes("<FoodList single"), "single-pick list");
  assert.ok(s.includes("startFinder"), "web/finder.ts");
});
