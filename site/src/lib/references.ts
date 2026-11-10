// The site's single list of references (data/sources.json), numbered in IEEE style: [1], [2], ...
// The same number means the same source on every page.
import register from "../../../data/sources.json";
import manifest from "../../../docs/sources/manifest.json";

type Archive = { label?: string; file?: string; release?: string; fetch?: string | string[]; render?: boolean };
export type Source = {
  id: string; pre: string; title: string; style: "quoted" | "italic"; post: string; url: string;
  licence: string; usedFor: string; archive: Archive[];
};

export const SOURCES = register.sources as Source[];
const INDEX = new Map(SOURCES.map((s, i) => [s.id, i + 1]));
const MANIFEST = manifest as Record<string, { retrieved?: string | null; sha256?: string }>;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "Jun.", "Jul.", "Aug.", "Sep.", "Oct.", "Nov.", "Dec."];

export function refNumber(id: string): number {
  const n = INDEX.get(id);
  if (!n) throw new Error(`Unknown reference: ${id}`);
  return n;
}

/** In-text citation, e.g. [3] or [3], [6]. Links to the entry in the page's reference list. */
export function cite(...ids: string[]): string {
  return ids.map((id) => `<a class="cite" href="#ref-${id}">[${refNumber(id)}]</a>`).join(", ");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const ieeeDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};

export type ArchiveLink = { label: string; href: string; sha256?: string; retrieved?: string | null };

export function archiveLinks(s: Source): ArchiveLink[] {
  return s.archive.map((a) => {
    if (a.release) return { label: a.label ?? "Archived copy", href: a.release };
    const meta = MANIFEST[a.file!];
    return { label: a.label ?? "Archived copy", href: register.repoBlob + a.file, sha256: meta?.sha256, retrieved: meta?.retrieved };
  }).filter((l) => l.href.includes("/releases/") || l.sha256); // only copies that actually exist
}

/** One reference-list entry as HTML (the register's text is our own and may contain <i>). */
export function entryHtml(s: Source): string {
  const title = s.style === "italic" ? `<i>${esc(s.title)}</i>,` : `“${esc(s.title)},”`;
  const links = archiveLinks(s);
  const retrieved = links.map((l) => l.retrieved).filter(Boolean).sort()[0];
  const accessed = retrieved ? ` Accessed: ${ieeeDate(retrieved)}.` : "";
  const archive = links.length
    ? links.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join(" · ")
    : `<span class="muted">archived copy not yet available</span>`;
  return `${esc(s.pre)} ${title} ${s.post}${accessed} [Online]. Available: <a href="${esc(s.url)}">${esc(s.url)}</a>`
    + `<span class="ref-meta">${archive}. <span class="muted">Used for: ${esc(s.usedFor)}. ${esc(s.licence)}.</span></span>`;
}
