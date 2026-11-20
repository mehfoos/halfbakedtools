// IEEE-style numbered references, one list per tool (tools/<slug>/references.json).
// A tool's pages number its sources [1], [2], ... in the order of that file, so a number means the
// same source on every page of that tool. Archived copies are files of the "source-archive" release
// (sources/archive.json); none are committed to the repository.
import releaseManifest from "../../../sources/release-manifest.json";
import { site } from "../site.config.ts";

// asset: a copy in the "source-archive" release (sources/archive.json);
// release: a link to another release asset (older USDA snapshots);
// private: a copy the site owner keeps privately because the publisher doesn't allow redistribution (owner's decision,
//   20 Nov 2026): not published; the reference shows why and, once the copy is checked, its SHA-256.
type Archive = {
  label?: string; asset?: string; release?: string; fetch?: string | string[]; render?: boolean;
  private?: string; sha256?: string; reason?: string;
};
export type Source = {
  id: string; pre: string; title: string; style: "quoted" | "italic"; post: string; url: string;
  licence: string; usedFor: string; archive: Archive[];
};
export type ReferenceFile = { sources: Source[] };
export type ArchiveLink = { label: string; href: string; sha256?: string; retrieved?: string | null; verified?: boolean };

const RELEASE = releaseManifest as Record<string, { retrieved?: string | null; added?: string; sha256?: string }>;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const ieeeDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export function archiveLinks(s: Source): ArchiveLink[] {
  return s.archive.filter((a) => !a.private).map((a) => {
    if (a.release) return { label: a.label ?? "Archived copy", href: a.release };
    const meta = RELEASE[a.asset!];  // present only once the file has been verified in the release
    return { label: a.label ?? "Archived copy", href: site.releaseArchiveUrl + a.asset, sha256: meta?.sha256,
             retrieved: meta?.retrieved ?? meta?.added, verified: !!meta };
  }).filter((l) => l.verified !== false).map(({ verified, ...l }) => l); // only copies that are actually there
}

/** One reference-list entry as HTML (the reference files are our own and may contain <i>). */
export function entryHtml(s: Source): string {
  const title = s.style === "italic" ? `<i>${esc(s.title)}</i>,` : `“${esc(s.title)},”`;
  const links = archiveLinks(s);
  const retrieved = links.map((l) => l.retrieved).filter(Boolean).sort()[0];
  const accessed = retrieved ? ` Accessed: ${ieeeDate(retrieved)}.` : "";
  const kept = s.archive.filter((a) => a.private).map((a) => `${esc(a.label ?? "Copy")} kept privately by the site owner, not published`
    + ` (${esc(a.reason ?? "the publisher doesn't allow redistribution")})`
    + (a.sha256 ? `; SHA-256 <code title="${esc(a.sha256)}">${esc(a.sha256.slice(0, 12))}…</code>` : "; copy not yet checked"));
  const parts = [...links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`), ...kept];
  const archive = parts.length ? parts.join(" · ") : `<span class="muted">archived copy not yet available</span>`;
  return `${esc(s.pre)} ${title} ${s.post}${accessed} [Online]. Available: <a href="${esc(s.url)}">${esc(s.url)}</a>`
    + `<span class="ref-meta">${archive}. <span class="muted">Used for: ${esc(s.usedFor)}. ${esc(s.licence)}.</span></span>`;
}

/** Citation helpers for one tool's reference list. */
export function referencesFor(file: ReferenceFile) {
  const sources = file.sources;
  const index = new Map(sources.map((s, i) => [s.id, i + 1]));
  const number = (id: string) => {
    const n = index.get(id);
    if (!n) throw new Error(`Unknown reference: ${id}`);
    return n;
  };
  /** In-text citation, e.g. [3] or [3], [6]. Links to the entry in the page's reference list. */
  const cite = (...ids: string[]) => ids.map((id) => `<a class="cite" href="#ref-${id}">[${number(id)}]</a>`).join(", ");
  return { sources, number, cite };
}
