// WOFF (version 1) font files are ordinary TrueType/OpenType fonts with each table compressed (zlib). This turns
// one back into the plain font file, which HarfBuzz and the PDF library both read. Following the W3C WOFF 1.0
// recommendation's file layout (header, table directory, tables). WOFF 2 uses a different compression and table
// transforms and is not handled here.
import { unzlibSync } from "fflate";

export const isWoff = (b: Uint8Array) => b.length > 44 && b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46;   // "wOFF"
export const isWoff2 = (b: Uint8Array) => b.length > 48 && b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x32;  // "wOF2"

export function woffToSfnt(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const flavor = dv.getUint32(4), n = dv.getUint16(12), total = dv.getUint32(16);
  const tables: { tag: number; checksum: number; data: Uint8Array }[] = [];
  for (let i = 0; i < n; i++) {
    const at = 44 + i * 20, tag = dv.getUint32(at), off = dv.getUint32(at + 4), comp = dv.getUint32(at + 8), orig = dv.getUint32(at + 12), checksum = dv.getUint32(at + 16);
    if (off + comp > b.length) throw new Error("This WOFF font file is damaged.");
    const raw = b.subarray(off, off + comp), data = comp < orig ? unzlibSync(raw) : raw;
    if (data.length !== orig) throw new Error("This WOFF font file is damaged.");
    tables.push({ tag, checksum, data });
  }
  tables.sort((a, c) => a.tag - c.tag);
  const pad = (x: number) => (x + 3) & ~3, out = new Uint8Array(Math.max(total, 12 + 16 * n + tables.reduce((s, t) => s + pad(t.data.length), 0))), o = new DataView(out.buffer);
  const es = Math.floor(Math.log2(n));
  o.setUint32(0, flavor); o.setUint16(4, n); o.setUint16(6, 16 * 2 ** es); o.setUint16(8, es); o.setUint16(10, n * 16 - 16 * 2 ** es);
  let at = 12 + 16 * n;
  tables.forEach((t, i) => { const r = 12 + 16 * i; o.setUint32(r, t.tag); o.setUint32(r + 4, t.checksum); o.setUint32(r + 8, at); o.setUint32(r + 12, t.data.length); out.set(t.data, at); at += pad(t.data.length); });
  return out.subarray(0, at);
}
