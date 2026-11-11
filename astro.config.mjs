import { defineConfig } from "astro/config";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const TOOLS = join(ROOT, "tools");

/** Every folder in tools/ with a tool.json is a tool (folders starting with "_" are templates). */
export function toolFolders() {
  return readdirSync(TOOLS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(join(TOOLS, d.name, "tool.json")))
    .map((d) => d.name);
}

/**
 * Serves each tool's own pages: tools/<slug>/pages/index.astro -> /tools/<slug>/,
 * tools/<slug>/pages/<name>.astro -> /tools/<slug>/<name>/. A tool needs no edits outside its folder.
 */
function toolRoutes() {
  return {
    name: "halfbakedtools:tool-routes",
    hooks: {
      "astro:config:setup": ({ injectRoute }) => {
        for (const slug of toolFolders()) {
          const meta = JSON.parse(readFileSync(join(TOOLS, slug, "tool.json"), "utf8"));
          if (meta.slug !== slug) throw new Error(`tools/${slug}/tool.json: slug must be "${slug}"`);
          const pages = join(TOOLS, slug, "pages");
          for (const f of readdirSync(pages).filter((f) => f.endsWith(".astro"))) {
            const name = f.replace(/\.astro$/, "");
            injectRoute({ pattern: name === "index" ? `/tools/${slug}` : `/tools/${slug}/${name}`, entrypoint: join(pages, f) });
          }
        }
      },
    },
  };
}

// SITE_URL / SITE_BASE let the same build work on the custom domain
// (https://halfbakedtools.com, base "/") or on a github.io project URL
// (https://<user>.github.io/halfbakedtools, base "/halfbakedtools/").
export default defineConfig({
  site: process.env.SITE_URL || "https://halfbakedtools.com",
  base: process.env.SITE_BASE || "/",
  srcDir: "./site/src",
  publicDir: "./site/public",
  outDir: "./dist",
  trailingSlash: "always",
  build: { format: "directory" },
  integrations: [toolRoutes()],
  vite: {
    worker: { format: "es" },
    resolve: { alias: { "@site": join(ROOT, "site/src"), "@tools": TOOLS, "@sources": join(ROOT, "sources") } },
  },
});
