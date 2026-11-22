#!/usr/bin/env python3
"""Check every link to a source or further-reading page on the site (principle 3 in AGENTS.md).

Links checked:
  * the "url" of every reference in tools/*/references.json;
  * every https:// link written in a tool's pages (tools/*/pages/*.astro) and code (tools/*/web/*.ts, not tests),
    which covers further-reading links such as the exercise planner's how-to pages.

It never changes a file. It prints a report and, with --report FILE, writes it as Markdown for the "Link check"
workflow, which opens or updates an issue. An editor then fixes each link, re-checks the source against what the
site uses, and updates that reference's "accessed" date.

Each link is put in one of three groups:
  * broken:  the page answered "not found" or "gone" (404, 410), or the address doesn't resolve;
  * unclear: the site refused or failed (401, 403, 429, 5xx, a timeout). Many publishers block automated checks,
             so these need opening in a browser before anything is changed;
  * fine:    the page loaded (after any redirects).

Usage: python3 -I scripts/check_links.py [--list] [--report FILE]
"""
import argparse
import json
import re
import socket
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LINK = re.compile(r'https://[^\s"\'<>`)\]\\]+')
UA = "Mozilla/5.0 (compatible; HalfBakedToolsLinkCheck/1.0; +https://github.com/mehfoos/halfbakedtools)"


def collect() -> dict[str, set[str]]:
    """Every link, with where it appears."""
    found: dict[str, set[str]] = {}
    def add(url: str, where: str) -> None:
        url = url.rstrip(".,;:")
        found.setdefault(url, set()).add(where)
    for tool in sorted((ROOT / "tools").iterdir()):
        if not tool.is_dir() or tool.name.startswith("_"):
            continue
        refs = tool / "references.json"
        if refs.exists():
            for s in json.loads(refs.read_text(encoding="utf-8"))["sources"]:
                add(s["url"], f"{tool.name}: reference {s['id']}")
        files = list((tool / "pages").glob("*.astro")) + [f for f in (tool / "web").glob("*.ts") if not f.name.endswith(".test.ts")]
        for f in files:
            for url in LINK.findall(f.read_text(encoding="utf-8")):
                add(url, f"{tool.name}: {f.relative_to(tool)}")
    return found


def check(url: str) -> tuple[str, str]:
    for method in ("HEAD", "GET"):  # some servers refuse HEAD; try GET before reporting a problem
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return "fine", str(r.status)
        except urllib.error.HTTPError as e:
            if method == "HEAD" and e.code in (400, 403, 404, 405, 406, 429, 500, 501, 503):
                continue
            return ("broken" if e.code in (404, 410) else "unclear"), f"HTTP {e.code}"
        except urllib.error.URLError as e:
            reason = e.reason
            if isinstance(reason, socket.gaierror):
                return "broken", "address doesn't resolve"
            if method == "HEAD":
                continue
            return "unclear", str(reason)[:80]
        except Exception as e:  # timeouts, resets
            if method == "HEAD":
                continue
            return "unclear", type(e).__name__
    return "unclear", "no answer"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true", help="list the links and where they appear, without checking")
    ap.add_argument("--report", help="write a Markdown report to this file")
    args = ap.parse_args()
    links = collect()
    if args.list:
        for url, where in sorted(links.items()):
            print(url, "|", "; ".join(sorted(where)))
        print(f"{len(links)} links", file=sys.stderr)
        return 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = dict(zip(links, pool.map(check, links)))
    groups = {g: [(u, why) for u, (gg, why) in sorted(results.items()) if gg == g] for g in ("broken", "unclear", "fine")}
    lines = [f"Checked {len(links)} links: {len(groups['broken'])} broken, {len(groups['unclear'])} unclear, "
             f"{len(groups['fine'])} fine.", ""]
    for g, title in (("broken", "Broken (not found, gone, or the address doesn't resolve)"),
                     ("unclear", "Unclear (refused or failed: open in a browser before changing anything)")):
        if groups[g]:
            lines += [f"### {title}", ""]
            lines += [f"- {u} ({why}), in {'; '.join(sorted(links[u]))}" for u, why in groups[g]]
            lines.append("")
    lines += ["For each link: find the current address, re-check the source still says what the site uses, and update "
              "the reference's `accessed` date (principle 3 in `AGENTS.md`)."]
    report = "\n".join(lines)
    print(report)
    if args.report:
        Path(args.report).write_text(report + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
