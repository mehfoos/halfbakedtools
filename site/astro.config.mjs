import { defineConfig } from "astro/config";

// SITE_URL / SITE_BASE let the same build work on the custom domain
// (https://halfbakedtools.com, base "/") or on a github.io project URL
// (https://<user>.github.io/halfbakedtools, base "/halfbakedtools/").
export default defineConfig({
  site: process.env.SITE_URL || "https://halfbakedtools.com",
  base: process.env.SITE_BASE || "/",
  trailingSlash: "always",
  build: { format: "directory" },
  vite: { worker: { format: "es" } },
});
