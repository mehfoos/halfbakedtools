// Writes an uncompressed 24-bit BMP image from RGBA pixels. Pure; no DOM.
// BMP has no transparency here: see-through pixels are blended onto white.
export function encodeBmp(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, dpi = 96): Uint8Array {
  if (rgba.length !== width * height * 4) throw new Error("Pixel data doesn't match the image size.");
  const row = Math.ceil((width * 3) / 4) * 4;         // rows are padded to a multiple of 4 bytes
  const size = 54 + row * height;
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  const ppm = Math.round(dpi / 0.0254);               // pixels per metre
  out[0] = 0x42; out[1] = 0x4d;                       // "BM"
  v.setUint32(2, size, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, width, true); v.setInt32(22, height, true);
  v.setUint16(26, 1, true); v.setUint16(28, 24, true); v.setUint32(34, row * height, true);
  v.setInt32(38, ppm, true); v.setInt32(42, ppm, true);
  for (let y = 0; y < height; y++) {
    let o = 54 + (height - 1 - y) * row;              // BMP stores the bottom row first
    for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
      const a = rgba[i + 3] / 255, bg = 255 * (1 - a);
      out[o++] = Math.round(rgba[i + 2] * a + bg);    // blue, green, red
      out[o++] = Math.round(rgba[i + 1] * a + bg);
      out[o++] = Math.round(rgba[i] * a + bg);
    }
  }
  return out;
}
