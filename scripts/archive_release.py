#!/usr/bin/env python3
"""Keep the files listed in sources/archive.json in the 'source-archive' GitHub release.

Large reference files (datasets, long reports) are kept as release assets so they stay out of the repository's
history. For every file in the registry this script:

  * if the release already has it: downloads it and checks its SHA-256;
  * otherwise, if it has a 'fetch' address (or a 'zip' list): downloads it from the official site, checks it
    against the expected SHA-256 recorded when it was first checked, and uploads it only if it matches;
  * otherwise ('manual'), or if the download fails: takes the copy from the inbox, if there is one there;
  * otherwise reports that it is waiting to be attached by hand.

The inbox is a folder (ARCHIVE_INBOX, default ./inbox) that the workflow fills from the temporary
'source-inbox' branch, so files a publisher will not let a script download can be staged by a commit instead of
being attached by hand. Inbox copies are checked against the expected SHA-256 like any other. When every inbox
file is in the release and verified, the script writes the file named by INBOX_CLEAR so the workflow can delete
the branch, which keeps those files out of the repository.

A file whose checksum differs from the expected one is never uploaded or accepted: the publisher may have changed
it, and a person must look at it and update the registry. Results are written to sources/release-manifest.json
and summarised for the workflow run page.

Runs on GitHub Actions (see .github/workflows/archive-release.yml), which provides the `gh` command and a token.
Standard library only otherwise. Can be run locally with `gh` signed in:
  python3 -I scripts/archive_release.py [--dry-run]
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


def from_inbox(inbox: Path, e: dict) -> bytes | None:
    p = inbox / e["file"]
    return p.read_bytes() if p.is_file() else None


def main() -> int:
    dry = "--dry-run" in sys.argv
    inbox = Path(os.environ.get("ARCHIVE_INBOX", "inbox"))
    inbox_names = {p.name for p in inbox.iterdir() if p.is_file() and p.name != "README.md"} if inbox.is_dir() else set()
    verified: set[str] = set()
    reg = json.loads(REGISTRY.read_text())
    tag = reg["release"]
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    today = dt.date.today().isoformat()
    have = {a["name"] for a in json.loads(gh("release", "view", tag, "--json", "assets"))["assets"]}
    lines, problems = [], 0
    with tempfile.TemporaryDirectory() as tmp:
        for e in reg["files"]:
            name, status = e["file"], ""
            try:
                if name in have:
                    gh("release", "download", tag, "--pattern", name, "--dir", tmp, "--clobber")
                    data = (Path(tmp) / name).read_bytes()
                    ok = zip_members_ok(data, e["zip"]) if "zip" in e else (e.get("sha256") in (None, sha256(data)))
                    status = "in the release, checksum verified" if ok else "IN THE RELEASE BUT DIFFERS FROM THE CHECKED COPY"
                    if ok:
                        first = manifest.get(name) or {"note": "attached to the release by hand", "added": today}
                        manifest[name] = first | {"sha256": sha256(data), "bytes": len(data), "verified": today}
                else:
                    data, how, fetch_error = None, "", ""
                    if "fetch" in e or "zip" in e:
                        try:
                            data = build_zip(e["zip"]) if "zip" in e else download(e["fetch"])
                            how = "downloaded"
                        except Exception as err:
                            fetch_error = str(err)
                    if data is None or ("sha256" in e and sha256(data) != e["sha256"]):
                        staged = from_inbox(inbox, e)
                        if staged is not None:
                            data, how = staged, "taken from the inbox"
                    if data is None:
                        status = (f"FAILED: {fetch_error}. " if fetch_error else "WAITING: ") + \
                            "stage it on the source-inbox branch or attach it to the release by hand. " + e.get("manual", "")
                    elif "sha256" in e and sha256(data) != e["sha256"]:
                        status = f"NOT UPLOADED: the copy {how} differs from the checked copy (got {sha256(data)[:12]}...)"
                    else:
                        p = Path(tmp) / name
                        p.write_bytes(data)
                        if not dry:
                            gh("release", "upload", tag, str(p), capture=False)
                        manifest[name] = {"sha256": sha256(data), "bytes": len(data), "retrieved": today, "verified": today}
                        if how == "downloaded":
                            manifest[name]["url"] = e.get("fetch") or [m["fetch"] for m in e["zip"]]
                        else:
                            manifest[name]["note"] = "staged by the owner (publisher blocks scripted downloads)"
                        status = f"{how}, checked and uploaded" + (" (dry run: not uploaded)" if dry else "")
            except Exception as err:  # one file's failure must not stop the others
                status = f"FAILED: {err}"
            if status.startswith(("in the release, checksum", "downloaded", "taken from the inbox")):
                verified.add(name)
            else:
                problems += 1
            lines.append(f"| `{name}` | {status} |")
    manifest = {k: manifest[k] for k in sorted(manifest) if any(e["file"] == k for e in reg["files"])}
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    summary = "\n".join([f"## Source archive ({tag})", "", f"{len(reg['files']) - problems} of {len(reg['files'])} files "
                         "are in the release and verified.", "", "| File | Status |", "|---|---|", *lines, ""])
    leftover = sorted(inbox_names - verified)
    if inbox_names:
        summary += ("\nEvery inbox file is in the release, so the source-inbox branch can be deleted.\n" if not leftover
                    else "\nKept the source-inbox branch: " + ", ".join(f"`{n}`" for n in leftover) + " not verified.\n")
        if not leftover and not dry and os.environ.get("INBOX_CLEAR"):
            Path(os.environ["INBOX_CLEAR"]).write_text("clear\n")
    print(summary)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(os.environ["GITHUB_STEP_SUMMARY"]).write_text(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
