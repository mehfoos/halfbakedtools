// Text shaping with HarfBuzz (the shaping engine web browsers use), compiled to WebAssembly by the harfbuzzjs package.
// Loaded only when a visitor's own font is used. Its WebAssembly file is bundled into this site and loaded from it.
import type { Shaper, ShapedGlyph } from "./face.ts";

type Hb = typeof import("harfbuzzjs");
let loading: Promise<Hb> | null = null;
const harfbuzz = (): Promise<Hb> => (loading ??= import("harfbuzzjs"));

/** A shaper for face number `index` of the font file `bytes` (0 unless the file is a collection). */
export async function harfBuzzShaper(bytes: Uint8Array, index = 0): Promise<Shaper> {
  const hb = await harfbuzz();
  const font = new hb.Font(new hb.Face(new hb.Blob(bytes.slice().buffer), index));   // scale stays at the font's units per em
  return (text: string, rtl: boolean): ShapedGlyph[] => {
    const buf = new hb.Buffer();
    buf.addText(text); buf.guessSegmentProperties(); buf.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    buf.setClusterLevel(hb.ClusterLevel.CHARACTERS);   // keep each character its own cluster where possible, so most glyphs map to their own character
    hb.shape(font, buf);
    const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
    // Clusters are positions in the text (UTF-16 code units). Each cluster's characters are given to its first glyph.
    const starts = [...new Set(infos.map((g) => g.cluster))].sort((a, b) => a - b), seen = new Set<number>();
    return infos.map((g, i) => {
      const first = !seen.has(g.cluster); seen.add(g.cluster);
      const end = starts.find((c) => c > g.cluster) ?? text.length;
      return { id: g.codepoint, chars: first ? text.slice(g.cluster, end) : "", ax: pos[i].xAdvance, dx: pos[i].xOffset, dy: pos[i].yOffset };
    });
  };
}
