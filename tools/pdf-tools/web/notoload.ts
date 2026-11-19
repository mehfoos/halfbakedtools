// Browser side of the shipped Noto fonts: each file is bundled into the site as its own small script (loaded only when
// needed, from this site), holding the WOFF file as base64. Chinese, Japanese and Korean: only their numbered files.
import type { NotoLoader } from "./noto.ts";

const files = import.meta.glob([
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-greek-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-greek-ext-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans/files/noto-sans-vietnamese-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-malayalam/files/noto-sans-malayalam-malayalam-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-hebrew/files/noto-sans-hebrew-hebrew-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-gurmukhi/files/noto-sans-gurmukhi-gurmukhi-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-telugu/files/noto-sans-telugu-telugu-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-kannada/files/noto-sans-kannada-kannada-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff"
,
    "../../../node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-[0-9]*-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-tc/files/noto-sans-tc-[0-9]*-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-jp/files/noto-sans-jp-[0-9]*-400-normal.woff",
    "../../../node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-[0-9]*-400-normal.woff"
  ], { query: "?inline", import: "default" }) as Record<string, () => Promise<string>>;

export const loadNoto: NotoLoader = async (id) => {
  const key = Object.keys(files).find((k) => k.endsWith(`/${id}-400-normal.woff`));
  if (!key) throw new Error(`The font file ${id} isn't part of this site.`);
  const url = await files[key](), b64 = url.slice(url.indexOf(",") + 1), bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
