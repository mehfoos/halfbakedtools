// An sRGB colour profile (ICC version 2.4, a display profile of the matrix-and-curves kind), made by this code so no
// third-party profile file is copied. PDF/A needs one to say what the file's plain RGB and grey colours mean.
//
// Layout: ICC.1:2001-04, "File Format for Color Profiles" (archived; cited on the methods page): the 128-byte header
// (6.1, Table 9), the tag table (6.2, Table 19), the tags an RGB display profile requires (6.3.2.2, Table 25), and
// the tag types used: curveType (6.5.3), textDescriptionType (6.5.17), textType (6.5.18), XYZType (6.5.26).
// Numbers: sRGB as W3C CSS Color Module Level 4 gives it (archived; Candidate Recommendation Draft of 18 November
// 2026, sample code): the linear-sRGB-to-XYZ matrix (D65), the Bradford adaptation from D65 to D50, and the sRGB
// transfer function. Profiles are referred to D50 (ICC.1:2001-04, A.1), so the colorants are the sRGB primaries
// adapted to D50; for a display the white point tag is the PCS white, D50 (A.3.1.1).

/** CSS Color 4: lin_sRGB_to_XYZ (rows give X, Y, Z from linear r, g, b; white D65). */
const SRGB_TO_XYZ_D65 = [
  [506752 / 1228815, 87881 / 245763, 12673 / 70218],
  [87098 / 409605, 175762 / 245763, 12673 / 175545],
  [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
];
/** CSS Color 4: D65_to_D50, the Bradford chromatic adaptation. */
const BRADFORD_D65_TO_D50 = [
  [1.0479297925449969, 0.022946870601609652, -0.05019226628920524],
  [0.02962780877005599, 0.9904344267538799, -0.017073799063418826],
  [-0.009243040646204504, 0.015055191490298152, 0.7518742814281371],
];
/** ICC.1:2001-04, 6.1 and A.1: the PCS illuminant, D50, as it is written in profiles. */
export const PCS_D50 = [0.9642, 1.0, 0.8249];

const mul = (a: number[][], b: number[][]) => a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s + x * b[k][j], 0)));
/** The red, green and blue colorants in the PCS (D50): columns of the adapted matrix. */
export function srgbColorants(): number[][] {
  const m = mul(BRADFORD_D65_TO_D50, SRGB_TO_XYZ_D65);
  return [0, 1, 2].map((c) => [m[0][c], m[1][c], m[2][c]]);
}
/** CSS Color 4 lin_sRGB: the sRGB value (0 to 1) to linear light. */
export const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

/** Entries in each tone curve: 1024 steps of the sRGB curve (curveType, 6.5.3: values 0 to 65535 map to 0.0 to 1.0). */
export const CURVE_POINTS = 1024;

class Writer {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 255); }
  u16(v: number) { this.u8(v >> 8); this.u8(v); }
  u32(v: number) { this.u16(Math.floor(v / 65536)); this.u16(v & 0xffff); }
  sig(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); }
  /** s15Fixed16Number (5.3.3): signed, 16 fractional bits. */
  s15(v: number) { const n = Math.round(v * 65536); this.u32(n < 0 ? n + 0x100000000 : n); }
  pad4() { while (this.bytes.length % 4) this.u8(0); }
}

function tag(type: string, body: (w: Writer) => void): number[] {
  const w = new Writer(); w.sig(type); w.u32(0); body(w); return w.bytes;   // type signature, then 4 reserved bytes
}
const xyz = (v: number[]) => tag("XYZ ", (w) => v.forEach((x) => w.s15(x)));
const ascii = (s: string) => [...s].map((c) => { const n = c.charCodeAt(0); if (n < 32 || n > 126) throw new Error("ICC text must be 7-bit ASCII"); return n; });

/** The profile's bytes. `created` goes in the header (6.1, dateTimeNumber 5.3.1); it is fixed so every copy is the same. */
export function srgbProfile(created = new Date(Date.UTC(2026, 10, 20))): Uint8Array {
  const description = "sRGB (IEC 61966-2-1), from W3C CSS Color 4 values; Half Baked Tools";
  const notice = "Made by Half Baked Tools (halfbakedtools.com) from the published sRGB definition.";
  const [r, g, b] = srgbColorants();
  const curve = tag("curv", (w) => { w.u32(CURVE_POINTS); for (let i = 0; i < CURVE_POINTS; i++) w.u16(Math.round(srgbToLinear(i / (CURVE_POINTS - 1)) * 65535)); });
  const tags: [string, number[]][] = [
    // textDescriptionType (6.5.17, Table 68): ASCII text with its count; no Unicode (code and count 0); no ScriptCode
    // (code 0, count 0, then the 67-byte Macintosh field filled with zeros).
    ["desc", tag("desc", (w) => { const a = ascii(description); w.u32(a.length + 1); a.forEach((c) => w.u8(c)); w.u8(0); w.u32(0); w.u32(0); w.u16(0); w.u8(0); for (let i = 0; i < 67; i++) w.u8(0); })],
    ["cprt", tag("text", (w) => { ascii(notice).forEach((c) => w.u8(c)); w.u8(0); })],   // textType (6.5.18): ends with 00h
    ["wtpt", xyz(PCS_D50)],
    ["rXYZ", xyz(r)], ["gXYZ", xyz(g)], ["bXYZ", xyz(b)],
    ["rTRC", curve], ["gTRC", curve], ["bTRC", curve],   // the three curves are the same: stored once, shared
  ];
  // Lay out the tag data after the header and the tag table, each tag starting on a 4-byte boundary; identical tag
  // data is stored once and pointed to by each signature.
  const tableEnd = 128 + 4 + tags.length * 12, data = new Writer(), at = new Map<number[], number>(), entries: [string, number, number][] = [];
  for (const [sig, body] of tags) {
    let offset = at.get(body);
    if (offset === undefined) { data.pad4(); offset = tableEnd + data.bytes.length; at.set(body, offset); body.forEach((x) => data.u8(x)); }
    entries.push([sig, offset, body.length]);
  }
  data.pad4();
  const size = tableEnd + data.bytes.length, w = new Writer();
  // Header (6.1, Table 9)
  w.u32(size); w.u32(0);                      // profile size; CMM type: none preferred
  w.u32(0x02400000);                          // version 2.4.0 (6.1.3)
  w.sig("mntr"); w.sig("RGB "); w.sig("XYZ "); // display device class (6.1.4), RGB data (6.1.5), XYZ connection space (6.1.6)
  for (const v of [created.getUTCFullYear(), created.getUTCMonth() + 1, created.getUTCDate(), created.getUTCHours(), created.getUTCMinutes(), created.getUTCSeconds()]) w.u16(v);
  w.sig("acsp"); w.u32(0); w.u32(0);          // file signature; no primary platform; flags 0 (6.1.7, 6.1.8)
  w.u32(0); w.u32(0); w.u32(0); w.u32(0);     // device manufacturer and model; attributes (6.1.9, 6.1.10)
  w.u32(0);                                   // rendering intent: perceptual (6.1.11)
  PCS_D50.forEach((x) => w.s15(x));           // the PCS illuminant, D50
  w.u32(0);                                   // creator: none registered (6.1.12)
  for (let i = 0; i < 44; i++) w.u8(0);       // reserved
  // Tag table (6.2, Table 19)
  w.u32(entries.length);
  for (const [sig, offset, length] of entries) { w.sig(sig); w.u32(offset); w.u32(length); }
  const out = new Uint8Array(size); out.set(w.bytes, 0); out.set(data.bytes, tableEnd);
  return out;
}
