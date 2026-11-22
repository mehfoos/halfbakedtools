// IEEE-style numbered references, one list per tool (tools/<slug>/references.json).
// A tool's pages number its sources [1], [2], ... in the order of that file, so a number means the
// same source on every page of that tool. Public copies are files of the "source-archive" release
// (sources/archive.json); none are committed to the repository.
import releaseManifest from "../../../sources/release-manifest.json";
import { site } from "../site.config.ts";

// Three layers for every source (AGENTS.md, principle 3; owner's decision, 20 Nov 2026):
//   1. the public reference itself, with the date the original was last read ("accessed");
//   2. the owner's private copy ("ownerCopy"): every source has one; only its file name and SHA-256 are recorded
//      here, never where it is stored;
//   3. a public copy in the "source-archive" release ("archive": [{"asset": ...}]), only for sources the site's numbers
//      come from, whose licence allows it, in a health tool or hard to obtain again. Otherwise "noPublicCopy" says why.
// archive entries: asset = a file of the "source-archive" release (sources/archive.json); release = a link to another
// release asset (older USDA snapshots).
type Archive = { label?: string; asset?: string; release?: string; fetch?: string | string[]; render?: boolean };
export type OwnerCopy = { file: string; sha256?: string; label?: string; fetch?: string; pending?: boolean };
export type NoPublicCopy = { why: "not-data" | "licence" | "easy-to-get"; note: string };
export type Source = {
  id: string; pre: string; title: string; style: "quoted" | "italic"; post: string; url: string;
  licence: string; usedFor: string;
  accessed: string | null;         // ISO date the original was last read and checked; null = not recorded (older entries)
  archive: Archive[];
  noPublicCopy?: NoPublicCopy;
  ownerCopy: OwnerCopy[] | "pending";
};
export type ReferenceFile = { sources: Source[] };
export type ArchiveLink = { label: string; href: string; sha256?: string };

const RELEASE = releaseManifest as Record<string, { retrieved?: string | null; added?: string; sha256?: string }>;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export const ieeeDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const NO_PUBLIC: Record<NoPublicCopy["why"], string> = {
  "licence": "No public copy: the publisher doesn't allow redistribution",
  "not-data": "No public copy: cited for background, no value in a result comes from it",
  "easy-to-get": "No public copy: freely available from the publisher",
};

/** Public copies that are actually in the release (verified), with their checksums. */
export function archiveLinks(s: Source): ArchiveLink[] {
  return s.archive.flatMap((a) => {
    if (a.release) return [{ label: a.label ?? "Archived copy", href: a.release }];
    const meta = RELEASE[a.asset!];  // present only once the file has been verified in the release
    return meta ? [{ label: a.label ?? "Archived copy", href: site.releaseArchiveUrl + a.asset, sha256: meta.sha256 }] : [];
  });
}

/** One reference-list entry as HTML (the reference files are our own and may contain <i>). */
export function entryHtml(s: Source): string {
  const title = s.style === "italic" ? `<i>${esc(s.title)}</i>,` : `“${esc(s.title)},”`;
  const accessed = s.accessed ? ` Accessed: ${ieeeDate(s.accessed)}.` : "";
  const links = archiveLinks(s).map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`);
  const copies: string[] = [];
  if (links.length) copies.push(links.join(" · "));
  else if (s.archive.length) copies.push(`<span class="muted">Public copy not yet available</span>`);
  if (s.noPublicCopy) copies.push(`${NO_PUBLIC[s.noPublicCopy.why]} (${esc(s.noPublicCopy.note)})`);
  // The owner's copy is mentioned only once every file of it is saved. Its checksum is shown only where there is no
  // public copy, since a public copy's checksum is already listed with the release.
  const owner = Array.isArray(s.ownerCopy) && s.ownerCopy.every((c) => !c.pending) ? s.ownerCopy : [];
  if (owner.length) copies.push("The site owner also keeps a private copy" + (!s.archive.length && owner.some((c) => c.sha256)
    ? ` (SHA-256 ${owner.filter((c) => c.sha256).map((c) => `<code title="${esc(c.sha256!)}">${esc(c.sha256!.slice(0, 12))}…</code>`).join(", ")})`
    : ""));
  const meta = [
    s.accessed ? "" : `<span class="muted">Access date not recorded.</span>`,
    copies.length ? copies.join(". ") + "." : "",
    `<span class="muted">Used for: ${esc(s.usedFor)}. ${esc(s.licence)}.</span>`,
  ].filter(Boolean).join(" ");
  return `${esc(s.pre)} ${title} ${s.post}${accessed} [Online]. Available: <a href="${esc(s.url)}">${esc(s.url)}</a>`
    + `<span class="ref-meta">${meta}</span>`;
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
