// Reads the "orientation" note that cameras and phones store in a JPEG photo. Pure; no DOM.
// A phone held sideways saves the pixels sideways plus a note saying how to turn them. Browsers obey the
// note when showing a photo; a JPEG placed in a PDF as it is does not, so the page must be turned to match.

/** EXIF orientation 1-8, or 1 if the file has none. */
export function jpegOrientation(b: Uint8Array): number {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return 1;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xff) {
    const marker = b[o + 1], len = v.getUint16(o + 2);
    if (marker === 0xda || marker === 0xd9) break;                       // image data starts: no EXIF before it
    if (marker === 0xe1 && len >= 16 && o + 2 + len <= b.length
      && String.fromCharCode(...b.subarray(o + 4, o + 10)) === "Exif\0\0") {
      const t = o + 10, le = v.getUint16(t) === 0x4949;                  // "II" = little-endian
      if (!le && v.getUint16(t) !== 0x4d4d) return 1;
      const ifd = t + v.getUint32(t + 4, le);
      if (ifd + 2 > o + 2 + len) return 1;
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 12 > o + 2 + len) return 1;
        if (v.getUint16(e, le) === 0x0112) { const val = v.getUint16(e + 8, le); return val >= 1 && val <= 8 ? val : 1; }
      }
      return 1;
    }
    o += 2 + len;
  }
  return 1;
}

/** Degrees clockwise the stored pixels must be turned to look right, or null if the photo is also mirrored. */
export function orientationToRotation(orientation: number): 0 | 90 | 180 | 270 | null {
  return ({ 1: 0, 3: 180, 6: 90, 8: 270 } as Record<number, 0 | 90 | 180 | 270>)[orientation] ?? null;
}
