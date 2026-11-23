// One style for every data caveat on the site: a fixed set of kinds, each with one label, rendered one way.
// Use caveat() in TypeScript and <Caveat> in Astro pages; never write a data disclaimer by hand. The pipeline's
// generated reports use the same labels (caveats.json, kept identical to KINDS by a test). See AGENTS.md.

export const KINDS = {
  alpha: { label: "Alpha", meaning: "An early version: expect gaps and changes, and check results before relying on them" },
  beta: { label: "Beta", meaning: "Working, but built by automated steps without manual human verification" },
  unverified: { label: "Not yet checked", meaning: "Not yet checked line by line against the original source" },
  assumption: { label: "Assumption", meaning: "Relies on an assumption the sources don't settle; the reason and evidence are given" },
  estimate: { label: "Estimate", meaning: "An estimate, or labelled by its source as estimated, calculated or borrowed" },
  translated: { label: "Translated", meaning: "A name or text translated by this site, not by the publisher" },
  borrowed: { label: "Borrowed", meaning: "The source took this from another source, so it isn't independent" },
  illustration: { label: "First-pass illustration", meaning: "Drawn by this site as a rough guide; not reviewed by a professional in the field" },
} as const;

export type CaveatKind = keyof typeof KINDS;

export interface CaveatOptions { id?: string; hidden?: boolean; small?: boolean }

/** A data caveat. `html` is trusted markup written by the site (escape any data put into it). */
export function caveat(kind: CaveatKind, html: string, opts: CaveatOptions = {}): string {
  const { id, hidden = false, small = true } = opts;
  const k = KINDS[kind];
  return `<p class="notice caveat${small ? " small" : ""}" data-caveat="${kind}"${id ? ` id="${id}"` : ""}` +
    `${hidden ? " hidden" : ""}><span class="caveat-kind" title="${k.meaning}">${k.label}</span> ${html}</p>`;
}
