"""Keep a copy of every reference in docs/sources/.

Reads data/sources.json. For each archive entry with a "fetch" URL whose file is missing (or all, with
--force), downloads it. Entries marked "render" are web pages: the raw HTML is saved next to a PDF printed
by headless Chrome, so the copy is readable on GitHub. Writes docs/sources/manifest.json with the retrieval
date, final URL and SHA-256 of every file in the folder.

Runs on GitHub Actions (which can reach the publishers' sites). Standard library only, plus a Chrome binary
for rendering (CHROME env var, default google-chrome).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REG = json.loads((ROOT / "data" / "sources.json").read_text())
DEST = ROOT / "docs" / "sources"
MANIFEST = DEST / "manifest.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 halfbakedtools-archiver (+https://halfbakedtools.com)"
CHROME = os.environ.get("CHROME", "google-chrome")


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def download(url: str, out: Path) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
        final = r.geturl()
    out.write_bytes(data)
    return final


def render(url: str, out: Path) -> None:
    subprocess.run([CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", f"--user-agent={UA}",
                    "--no-pdf-header-footer", "--virtual-time-budget=15000", f"--print-to-pdf={out}", url],
                   check=True, timeout=180, capture_output=True)
    if not out.exists() or out.stat().st_size < 2000:
        raise RuntimeError("rendered PDF missing or empty")


BLOCK_MARKERS = (b"Checking your browser", b"reCAPTCHA", b"captcha", b"Request Rejected", b"challenge-platform")


def fetch_one(src: dict, a: dict, url: str, out: Path, manifest: dict, today: str) -> None:
    if a.get("render"):
        html = out.with_suffix(".html")
        final = download(url, html)
        if any(m in html.read_bytes()[:200000] for m in BLOCK_MARKERS):
            html.unlink()
            raise RuntimeError("site returned a bot check instead of the page")
        render(url, out)
        manifest[html.name] = {"source": src["id"], "url": url, "finalUrl": final, "retrieved": today}
    else:
        final = download(url, out)
        if a["file"].endswith(".pdf") and out.read_bytes()[:5] != b"%PDF-":
            out.unlink()
            raise RuntimeError("response was not a PDF")
    manifest[out.name] = {"source": src["id"], "url": url, "finalUrl": final, "retrieved": today}


def main() -> int:
    force = "--force" in sys.argv
    DEST.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    today = dt.date.today().isoformat()
    failed: list[str] = []
    for src in REG["sources"]:
        for a in src.get("archive", []):
            if "fetch" not in a:
                continue
            out = DEST / a["file"]
            if out.exists() and not force:
                continue
            urls = a["fetch"] if isinstance(a["fetch"], list) else [a["fetch"]]
            errors = []
            for url in urls:
                try:
                    fetch_one(src, a, url, out, manifest, today)
                    print(f"ok      {a['file']}  <- {url}")
                    break
                except Exception as e:
                    errors.append(f"{url}: {e}")
            else:
                print(f"FAILED  {a['file']}: " + " | ".join(errors))
                if not a.get("optional"):
                    failed.append(a["file"])
    for f in sorted(DEST.iterdir()):
        if f.name in ("manifest.json", "README.md") or f.is_dir():
            continue
        owner = next((s["id"] for s in REG["sources"] for a in s.get("archive", []) if a.get("file") == f.name), None)
        manifest.setdefault(f.name, {"source": owner, "retrieved": None, "note": "uploaded by the site owner"})
        manifest[f.name]["sha256"] = sha256(f)
    manifest = {k: manifest[k] for k in sorted(manifest) if (DEST / k).exists()}
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    if failed:
        print("Required files that could not be fetched:", ", ".join(failed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
