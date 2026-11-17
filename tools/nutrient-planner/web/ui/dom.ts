// Small helpers shared by the page code: element lookup, HTML escaping and number formatting.

export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;
export const $$ = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => Array.from(root.querySelectorAll(sel)) as T[];

/** Escape text for use inside HTML. */
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A whole number with thousands separators, e.g. 1,847. */
export const int = (n: number) => n.toLocaleString("en-GB");

/** A nutrient amount to a sensible precision: 1,847; 12.5; 1.25; 0.12; "–" when missing. */
export const fmt = (v: number | undefined) => {
  if (v === undefined || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 100) return Math.round(v).toLocaleString("en-GB");
  if (a >= 10) return v.toFixed(1).replace(/\.0$/, "");
  if (a >= 1) return v.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
  if (a === 0) return "0";
  return Number(v.toPrecision(2)).toString();
};

/** A typed number, or null if the box is empty or not a number. */
export const numOrNull = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Round to a whole number and keep it within [min, max]; `fallback` if not a number. */
export const clampInt = (v: string, min: number, max: number, fallback: number) =>
  Math.min(max, Math.max(min, Math.round(Number(v) || fallback)));
