#!/usr/bin/env python3
"""Check the files listed in sources/archive.json against the 'source-archive' GitHub release.

Reference files (datasets, reports, saved web pages) are kept as release assets so they stay out of the
repository's history. New files are attached to the release BY HAND by the owner, after an editor has checked that
they are the right files and recorded them in the registry (see sources/README.md). Then run

  python3 -I scripts/archive_release.py --check

which downloads each release file, checks its SHA-256 against the registry, and records the verified files in
sources/release-manifest.json (commit that file). It needs only read access, so any editor can run it.

Without --check (the owner-run workflow, used for the files collected before Nov 2026), for every file it also:

  * if the release already has it: downloads it and checks its SHA-256;
  * otherwise, if it has a 'fetch' address (or a 'zip' list): downloads it from the official site, checks it
    against the expected SHA-256 recorded when it was first checked, and uploads it only if it matches;
  * otherwise ('manual'): reports that it is waiting to be attached by hand.

A file whose checksum differs from the expected one is never uploaded or accepted: the publisher may have changed
it, and a person must look at it and update the registry. Results are written to sources/release-manifest.json
and summarised for the workflow run page.

Runs on GitHub Actions (see .github/workflows/archive-release.yml), which provides the `gh` command and a token.
Standard library only otherwise. Can be run locally with `gh` signed in:
  python3 -I scripts/archive_release.py [--check | --dry-run]
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "sources" / "archive.json"
MANIFEST = ROOT / "sources" / "release-manifest.json"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 halfbakedtools-archiver (+https://halfbakedtools.com)"
BLOCK_MARKERS = (b"Checking your browser", b"Just a moment...", b"captcha", b"Security Check", b"challenge-platform")
ZIP_DATE = (2000, 1, 1, 0, 0, 0)  # fixed timestamps, so the same contents give the same zip


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def gh(*args: str, capture: bool = True) -> str:
    r = subprocess.run(["gh", *args], check=True, text=True, capture_output=capture)
    return r.stdout if capture else ""


def download(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    if not data:
        raise RuntimeError("the download was empty")
    if any(m in data[:20000] for m in BLOCK_MARKERS):
        raise RuntimeError("the site returned a bot check, not the file")
    return data


def build_zip(members: list[dict]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for m in members:
            data = download(m["fetch"])
            if sha256(data) != m["sha256"]:
                raise RuntimeError(f"{m['name']} differs from the checked copy (sha256 {sha256(data)})")
            info = zipfile.ZipInfo(m["name"], date_time=ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return buf.getvalue()


def zip_members_ok(data: bytes, members: list[dict]) -> bool:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return all(sha256(z.read(m["name"])) == m["sha256"] for m in members)


REPO = os.environ.get("GITHUB_REPOSITORY", "mehfoos/halfbakedtools")


def release_assets(tag: str, check_only: bool) -> set[str]:
    if not check_only:
        return {a["name"] for a in json.loads(gh("release", "view", tag, "--json", "assets"))["assets"]}
    url = f"https://api.github.com/repos/{REPO}/releases/tags/{tag}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return {a["name"] for a in json.load(r)["assets"]}


def fetch_asset(tag: str, name: str, tmp: str, check_only: bool) -> bytes:
    if check_only:  # the release is public: plain HTTPS, no token needed
        return download(f"https://github.com/{REPO}/releases/download/{tag}/{name}")
    gh("release", "download", tag, "--pattern", name, "--dir", tmp, "--clobber")
    return (Path(tmp) / name).read_bytes()


def main() -> int:
    dry = "--dry-run" in sys.argv
    check_only = "--check" in sys.argv
    reg = json.loads(REGISTRY.read_text())
    tag = reg["release"]
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    today = dt.date.today().isoformat()
    have = release_assets(tag, check_only)
    lines, problems = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for e in reg["files"]:
            name, status = e["file"], ""
            try:
                if name in have:
                    data = fetch_asset(tag, name, tmp, check_only)
                    ok = zip_members_ok(data, e["zip"]) if "zip" in e else (e.get("sha256") in (None, sha256(data)))
                    status = "in the release, checksum verified" if ok else "IN THE RELEASE BUT DIFFERS FROM THE CHECKED COPY"
                    if ok:
                        first = manifest.get(name) or {"note": "attached to the release by hand", "added": today}
                        if e.get("retrieved"):
                            first = first | {"retrieved": e["retrieved"]}
                        manifest[name] = first | {"sha256": sha256(data), "bytes": len(data), "verified": today}
                elif "fromRepo" in e and (ROOT / e["fromRepo"]).is_file() and not check_only:
                    # one-off move of a copy committed before Nov 2026 (see sources/README.md)
                    data = (ROOT / e["fromRepo"]).read_bytes()
                    if sha256(data) != e["sha256"]:
                        status = f"NOT UPLOADED: {e['fromRepo']} differs from its recorded checksum"
                    else:
                        p = Path(tmp) / name
                        p.write_bytes(data)
                        if not dry:
                            gh("release", "upload", tag, str(p), capture=False)
                        manifest[name] = {"sha256": sha256(data), "bytes": len(data), "retrieved": e.get("retrieved"),
                                          "verified": today, "note": "moved from the repository's sources/ folder"}
                        status = "downloaded from the repository copy, checked and uploaded"
                elif check_only:
                    status = "NOT IN THE RELEASE YET: the owner attaches it by hand"
                elif "fetch" in e or "zip" in e:
                    data = build_zip(e["zip"]) if "zip" in e else download(e["fetch"])
                    if "sha256" in e and sha256(data) != e["sha256"]:
                        status = f"NOT UPLOADED: the download differs from the checked copy (got {sha256(data)[:12]}...)"
                    else:
                        p = Path(tmp) / name
                        p.write_bytes(data)
                        if not dry:
                            gh("release", "upload", tag, str(p), capture=False)
                        manifest[name] = {"sha256": sha256(data), "bytes": len(data), "retrieved": today,
                                          "verified": today, "url": e.get("fetch") or [m["fetch"] for m in e["zip"]]}
                        status = "downloaded, checked and uploaded" + (" (dry run: not uploaded)" if dry else "")
                else:
                    status = "WAITING: attach this file to the release by hand. " + e.get("manual", "")
            except Exception as err:  # one file's failure must not stop the others
                status = f"FAILED: {err}"
            if not status.startswith(("in the release, checksum", "downloaded")):
                problems += 1
            lines.append(f"| `{name}` | {status} |")
    manifest = {k: manifest[k] for k in sorted(manifest) if any(e["file"] == k for e in reg["files"])}
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    summary = "\n".join([f"## Source archive ({tag})", "", f"{len(reg['files']) - problems} of {len(reg['files'])} files "
                         "are in the release and verified.", "", "| File | Status |", "|---|---|", *lines, ""])
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
