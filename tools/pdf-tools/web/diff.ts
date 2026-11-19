/**
 * Compare PDF: a word-by-word difference of the text of two files, page against page (page 1 with page 1, and so on).
 * Text only: pictures and drawings are not compared, and pages are matched by position, so inserting a page
 * near the start makes every later page differ.
 */
export type Op = { t: "same" | "del" | "add"; text: string };
export type PageDiff = { page: number; state: "same" | "changed" | "onlyA" | "onlyB"; ops: Op[]; removed: number; added: number; coarse: boolean };

const MAX_CELLS = 4_000_000;   // longest-common-subsequence table size we are willing to build

export const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);

/** Differences between two word lists. Past MAX_CELLS the middle is reported as wholly replaced (`coarse`). */
export function diffWords(a: string[], b: string[]): { ops: Op[]; coarse: boolean } {
  let lo = 0; while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let ea = a.length, eb = b.length; while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const ops: Op[] = [], push = (t: Op["t"], w: string) => { const l = ops[ops.length - 1]; if (l && l.t === t) l.text += ` ${w}`; else ops.push({ t, text: w }); };
  for (let i = 0; i < lo; i++) push("same", a[i]);
  const n = ea - lo, m = eb - lo; let coarse = false;
  if (n * m > MAX_CELLS) { coarse = true; for (let i = lo; i < ea; i++) push("del", a[i]); for (let j = lo; j < eb; j++) push("add", b[j]); }
  else if (n === 0 || m === 0) { for (let i = lo; i < ea; i++) push("del", a[i]); for (let j = lo; j < eb; j++) push("add", b[j]); }
  else {
    const w = m + 1, t = new Uint32Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i * w + j] = a[lo + i] === b[lo + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[lo + i] === b[lo + j]) { push("same", a[lo + i]); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) push("del", a[lo + i++]); else push("add", b[lo + j++]);
    }
    while (i < n) push("del", a[lo + i++]); while (j < m) push("add", b[lo + j++]);
  }
  for (let i = ea; i < a.length; i++) push("same", a[i]);
  return { ops, coarse };
}

/** Page-by-page comparison of the text of two documents. */
export function comparePages(a: string[], b: string[]): PageDiff[] {
  const out: PageDiff[] = [];
  for (let p = 0; p < Math.max(a.length, b.length); p++) {
    if (p >= b.length) { const w = words(a[p]); out.push({ page: p + 1, state: "onlyA", ops: w.length ? [{ t: "del", text: w.join(" ") }] : [], removed: w.length, added: 0, coarse: false }); continue; }
    if (p >= a.length) { const w = words(b[p]); out.push({ page: p + 1, state: "onlyB", ops: w.length ? [{ t: "add", text: w.join(" ") }] : [], removed: 0, added: w.length, coarse: false }); continue; }
    const { ops, coarse } = diffWords(words(a[p]), words(b[p]));
    const removed = ops.filter((o) => o.t === "del").reduce((n, o) => n + words(o.text).length, 0), added = ops.filter((o) => o.t === "add").reduce((n, o) => n + words(o.text).length, 0);
    out.push({ page: p + 1, state: removed || added ? "changed" : "same", ops, removed, added, coarse });
  }
  return out;
}

/** The differences as plain text for saving: "-" lines were only in the first file, "+" only in the second. */
export function diffReport(nameA: string, nameB: string, diffs: PageDiff[]): string {
  const lines = [`Text comparison (words, page against page). "-" is only in ${nameA}; "+" is only in ${nameB}.`, ""];
  for (const d of diffs) {
    if (d.state === "same") continue;
    lines.push(`Page ${d.page}${d.state === "onlyA" ? ` (only in ${nameA})` : d.state === "onlyB" ? ` (only in ${nameB})` : ""}: ${d.removed} words removed, ${d.added} added${d.coarse ? " (page too long to match word by word; shown as replaced)" : ""}`);
    for (const o of d.ops) if (o.t !== "same") lines.push(`${o.t === "del" ? "-" : "+"} ${o.text}`);
    lines.push("");
  }
  if (lines.length === 2) lines.push("No differences in the text of any page.");
  return lines.join("\n");
}
