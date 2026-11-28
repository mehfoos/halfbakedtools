#!/usr/bin/env python3
"""Join screenshots of a web page into one PDF, as a visual check beside its HTML owner's copy.

See sources/README.md, "Saving owner's copies". An editor scrolls the page in the owner's Chrome one window-height at a
time, takes a screenshot at each position (Claude in Chrome, save_to_disk), and notes each scroll position. This
joins them into one tall picture, cuts it into A4-shaped pages, and writes a PDF small enough to upload with the
Google Drive connector (about 3 MB at most): if it is too big, it lowers the JPEG quality and then the width.

Usage: python3 -I scripts/screens_to_pdf.py OUT.pdf SHOT.jpg:SCROLL_Y [SHOT.jpg:SCROLL_Y ...]
  Give the shots in the order taken. SCROLL_Y is the page's scrollY when the shot was taken (the last one is usually
  less than a full step, because the page ends). Prints the PDF's size and SHA-256.
"""
import hashlib
import io
import sys

from PIL import Image

LIMIT = 3_000_000


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out, shots = sys.argv[1], []
    for arg in sys.argv[2:]:
        path, _, y = arg.rpartition(":")
        shots.append((Image.open(path).convert("RGB"), round(float(y))))
    width, height = shots[0][0].size
    total = shots[-1][1] + shots[-1][0].size[1]
    page = Image.new("RGB", (width, total), "white")
    for img, y in shots:
        page.paste(img, (0, y))
    for scale in (1, 0.85, 0.7, 0.55):
        img = page if scale == 1 else page.resize((int(width * scale), int(total * scale)), Image.LANCZOS)
        w, h = img.size
        ph = int(w * 297 / 210)
        parts = [img.crop((0, y, w, min(y + ph, h))) for y in range(0, h, ph)]
        for quality in (85, 70, 55):
            buf = io.BytesIO()
            parts[0].save(buf, "PDF", save_all=True, append_images=parts[1:], resolution=150, quality=quality)
            if buf.tell() <= LIMIT:
                data = buf.getvalue()
                with open(out, "wb") as f:
                    f.write(data)
                print(f"{out}: {len(parts)} pages, {len(data)} bytes, scale {scale}, quality {quality}")
                print(f"sha256 {hashlib.sha256(data).hexdigest()}")
                return 0
    sys.exit("Still over 3 MB at the smallest setting: split the page into two PDFs (first and second half of the shots).")


if __name__ == "__main__":
    sys.exit(main())
