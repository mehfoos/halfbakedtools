#!/usr/bin/env python3
"""Compare the owner's private copies listed in tools/*/references.json with the owner's Drive, and fill the gaps.

See sources/README.md, "Syncing owner's copies". Run it only in a Claude Code session on the owner's archive
environment, which defines the rclone remote "hbt" through RCLONE_CONFIG_HBT_* variables, including
RCLONE_CONFIG_HBT_ROOT_FOLDER_ID (the private folder), so every path here is relative to that folder. The folder's
name, link and ID never appear in the repository.

Usage: python3 -I scripts/sync_owner_copies.py [--tool SLUG ...] [--apply] [--verify]

  (default)  Report only. Changes nothing anywhere.
  --apply    For each copy missing from Drive that can be downloaded: save it (web pages as MHTML with
             scripts/snapshot_pages.mjs), upload it, download it back, check the SHA-256 and record it in
             references.json. For each copy already in Drive with no SHA-256 recorded: download it and record it.
  --verify   Also download every copy that has a SHA-256 recorded and compare it (report only).

Where each copy goes: "<folder>/<file>", where folder is the entry's "folder" (e.g. "shared") or the tool's slug.
A copy marked "manual" (a page that needs a browser) is never downloaded here: it is saved through the owner's Chrome
into "_inbox/<file>" (Google Drive for desktop uploads it), and --apply copies it from there to its place.
Files named in sources/archive.json (the public release) also count as listed; --verify checks them against it.

Safety: never deletes, moves, renames or replaces anything in Drive (uploads use rclone's --immutable and only go
to paths the listing showed as empty). Never prints rclone's settings. Downloads go to a temporary directory outside
the repository and are removed at the end; reference files are never committed (AGENTS.md, principle 3).
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RCLONE = os.environ.get("HBT_RCLONE", "rclone")  # tests point this at a stand-in
REMOTE = "hbt:"
INBOX = "_inbox"  # where the owner's Chrome saves downloads (Google Drive for desktop syncs it)
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def rclone(*args):
    r = subprocess.run([RCLONE, *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"rclone {args[0]} failed: {r.stderr.strip()[-500:]}")
    return r.stdout


def drive_files():
    return {f["Path"]: f.get("Size") for f in json.loads(rclone("lsjson", "-R", "--files-only", REMOTE) or "[]")}


def load_tools(only):
    tools = {}
    for ref in sorted(ROOT.glob("tools/*/references.json")):
        slug = ref.parent.name
        if slug.startswith("_") or (only and slug not in only):
            continue
        tools[slug] = (ref, json.loads(ref.read_text(encoding="utf-8")))
    missing = set(only or []) - set(tools)
    if missing:
        sys.exit(f"No references.json for: {', '.join(sorted(missing))}")
    return tools


def looks_like_html(path):
    with open(path, "rb") as f:
        head = f.read(512).lstrip().lower()
    return head.startswith((b"<!doctype html", b"<html"))


def download(url, file, out):
    """Save url to out/file. Returns (path, None) or (None, reason)."""
    if file.endswith(".mht"):
        lst = out / "list.tsv"
        lst.write_text(f"{file}\t{url}\n", encoding="utf-8")
        snap = out / "snap"
        subprocess.run(["node", str(ROOT / "scripts/snapshot_pages.mjs"), str(lst), str(snap)],
                       capture_output=True, text=True)
        try:
            entry = json.loads((snap / "manifest.json").read_text())[0]
        except (OSError, ValueError, IndexError):
            return None, "snapshot script produced no manifest (is Chrome installed?)"
        if entry.get("failed"):
            return None, entry["failed"]
        if "just a moment" in (entry.get("title") or "").lower():
            return None, "browser check page ('Just a moment'), not the content"
        return snap / file, None
    path = out / file
    r = subprocess.run(["curl", "-fsSL", "--max-time", "600", "-A", UA, "-o", str(path), url],
                       capture_output=True, text=True)
    if r.returncode:
        return None, f"download failed: {r.stderr.strip()[-200:]}"
    if path.stat().st_size == 0:
        return None, "empty download"
    if not file.endswith((".html", ".htm")) and looks_like_html(path):
        return None, "got a web page instead of the file (blocked, or the link is a landing page: add 'fetch')"
    if file.endswith(".pdf") and not path.read_bytes()[:5] == b"%PDF-":
        return None, "not a PDF"
    return path, None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--tool", action="append", help="only this tool (repeatable); default: all tools")
    ap.add_argument("--apply", action="store_true", help="download, upload and record missing copies")
    ap.add_argument("--verify", action="store_true", help="download and check copies with a recorded SHA-256")
    a = ap.parse_args()
    if not os.environ.get("RCLONE_CONFIG_HBT_ROOT_FOLDER_ID"):
        sys.exit("RCLONE_CONFIG_HBT_ROOT_FOLDER_ID is not set: run this only in the archive environment.")

    tools = load_tools(a.tool)
    in_drive = drive_files()
    wanted, report, problems, used_inbox = set(), [], 0, set()
    tmp = Path(tempfile.mkdtemp(prefix="hbt-sync-"))
    try:
        for slug, (ref, data) in tools.items():
            changed = False
            for s in data["sources"]:
                oc = s.get("ownerCopy")
                if oc == "pending":
                    report.append(("no file name", f"{slug}: {s['id']}: give ownerCopy as "
                                   '[{"file": ..., "pending": true}]'))
                    continue
                for c in oc or []:
                    path = f"{c.get('folder', slug)}/{c['file']}"
                    if path in wanted:
                        continue  # the same copy cited twice
                    wanted.add(path)
                    work = tmp / str(len(wanted))
                    work.mkdir()
                    if path in in_drive:
                        if c.get("sha256") and not a.verify:
                            continue
                        if not a.apply and not a.verify:
                            if not c.get("sha256"):
                                report.append(("in Drive, no SHA-256", path))
                            continue
                        local = work / c["file"]
                        rclone("copyto", REMOTE + path, str(local))
                        h = sha256(local)
                        if c.get("sha256"):
                            if h != c["sha256"]:
                                problems += 1
                                report.append(("DIFFERS", f"{path}: Drive {h}, recorded {c['sha256']}"))
                        elif a.apply:
                            c["sha256"] = h
                            c.pop("pending", None)
                            changed = True
                            report.append(("recorded", f"{path} {h}"))
                        continue
                    # Missing from Drive. A copy saved through the owner's Chrome lands in _inbox under its file name.
                    inbox = f"{INBOX}/{c['file']}"
                    if inbox in in_drive:
                        used_inbox.add(inbox)
                        if not a.apply:
                            report.append(("in _inbox", f"{inbox} -> {path}"))
                            continue
                        rclone("copyto", "--immutable", REMOTE + inbox, REMOTE + path)
                        local = work / c["file"]
                        rclone("copyto", REMOTE + path, str(local))
                        h = sha256(local)
                        if c.get("sha256") and c["sha256"] != h:
                            problems += 1
                            report.append(("DIFFERS", f"{path}: copied from _inbox, {h} isn't the recorded {c['sha256']}"))
                            continue
                        c["sha256"] = h
                        c.pop("pending", None)
                        changed = True
                        report.append(("saved from _inbox", f"{path} {h}; {inbox} can now be removed"))
                        continue
                    if c.get("manual"):
                        report.append(("needs browser", f"{path}: {c['manual']}"))
                        continue
                    url = c.get("fetch") or s["url"]
                    if not a.apply:
                        report.append(("missing", f"{path} <- {url}"))
                        continue
                    local, why = download(url, c["file"], work)
                    if why:
                        problems += 1
                        report.append(("FAILED", f"{path}: {why}; if a browser can open it, mark it \"manual\""))
                        continue
                    h = sha256(local)
                    if c.get("sha256") and c["sha256"] != h:
                        problems += 1
                        report.append(("DIFFERS", f"{path}: today's download {h} isn't the recorded copy "
                                       f"{c['sha256']}; not uploaded (find the recorded copy, or re-check the source)"))
                        continue
                    rclone("copyto", "--immutable", str(local), REMOTE + path)
                    back = work / "check.bin"
                    rclone("copyto", REMOTE + path, str(back))
                    if sha256(back) != h:
                        problems += 1
                        report.append(("DIFFERS", f"{path}: uploaded copy doesn't match; left in Drive, not recorded"))
                        continue
                    report.append(("saved", f"{path} {h} ({local.stat().st_size} bytes)"))
                    c["sha256"] = h
                    c.pop("pending", None)
                    changed = True
            if changed:
                ref.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        # Files of the public release (sources/archive.json) also count as listed: the owner keeps them under the
        # same names (for example the raw HTML of a page whose PDF print is the ownerCopy).
        public = {f["file"]: f.get("sha256") for f in
                  json.loads((ROOT / "sources/archive.json").read_text(encoding="utf-8"))["files"]}
        scope = {f"{slug}/" for slug in tools} | ({"shared/"} if not a.tool else set())
        for path in sorted(in_drive):
            if path.startswith(INBOX + "/"):
                if path in used_inbox:
                    continue
                if path.rsplit("/", 1)[-1] in {w.rsplit("/", 1)[-1] for w in wanted}:
                    report.append(("in _inbox, already saved", f"{path}: can be removed"))
                elif not a.tool:
                    report.append(("in _inbox, not listed", path))
                continue
            if path in wanted or not any(path.startswith(p) for p in scope):
                continue
            name = path.rsplit("/", 1)[-1]
            if name.endswith(".screens.pdf") and path[: -len(".screens.pdf")] + ".html" in wanted:
                continue  # screenshots kept beside a page's HTML copy, as a visual check (not a listed copy)
            if name not in public:
                report.append(("in Drive, not listed", path))
            elif a.verify and public[name]:
                local = tmp / "public.bin"
                rclone("copyto", REMOTE + path, str(local))
                h = sha256(local)
                if h != public[name]:
                    problems += 1
                    report.append(("DIFFERS", f"{path}: Drive {h}, sources/archive.json {public[name]}"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    for kind, text in report:
        print(f"{kind:22} {text}")
    print(f"\n{len(wanted)} copies listed, {len(in_drive)} files in Drive"
          + ("" if a.apply else " (report only: nothing was changed)"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
