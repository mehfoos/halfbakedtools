// Browser side of the fonts PDF to PDF/A embeds in place of Helvetica, Times and Courier (THIRD-PARTY.md): each WOFF
// file is bundled into the site as its own small script holding it as base64, loaded only when a file needs it.
import type { FontFiles } from "./pdfaconvert.ts";

const files = import.meta.glob([
  "../../../node_modules/@fontsource/arimo/files/arimo-{latin,latin-ext}-{400,700}-{normal,italic}.woff",
  "../../../node_modules/@fontsource/tinos/files/tinos-{latin,latin-ext}-{400,700}-{normal,italic}.woff",
  "../../../node_modules/@fontsource/cousine/files/cousine-{latin,latin-ext}-{400,700}-{normal,italic}.woff",
], { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>;

export const loadSubstitute: FontFiles = async (family, style, subset) => {
  const key = Object.keys(files).find((k) => k.endsWith(`/${family}-${subset}-${style}.woff`));
  if (!key) throw new Error(`The font file ${family} ${subset} ${style} isn't part of this site.`);
  const url = await files[key](), bin = atob(url.slice(url.indexOf(",") + 1)), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
