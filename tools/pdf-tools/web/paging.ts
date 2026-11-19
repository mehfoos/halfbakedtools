// Showing a long page list a screenful at a time. Pure arithmetic, so it is tested without a browser.

export const TILE_W = 140;      // approximate width of one page tile, in CSS pixels, including its gap
export const TILE_H = 196;      // approximate height of one page tile, including its gap
export const MIN_PER_SCREEN = 6;
export const MAX_PER_SCREEN = 60;

/** How many page tiles fit comfortably in the space available: whole rows, never a half-empty last row.
 *  `chrome` is the height taken by everything else on screen (toolbar, headings, pager); at least two rows are kept. */
export function perScreen(width: number, height: number, chrome = 330): number {
  const columns = Math.max(1, Math.floor(width / TILE_W));
  const rows = Math.max(2, Math.min(6, Math.floor((height - chrome) / TILE_H)));
  return Math.max(MIN_PER_SCREEN, Math.min(MAX_PER_SCREEN, columns * rows));
}

export const screenCount = (total: number, per: number): number => Math.max(1, Math.ceil(total / Math.max(1, per)));
export const clampScreen = (screen: number, total: number, per: number): number => Math.max(0, Math.min(screenCount(total, per) - 1, Math.floor(screen) || 0));
/** The page numbers (0-based, end exclusive) shown on a screen. */
export const screenRange = (screen: number, total: number, per: number): { start: number; end: number } => {
  const s = clampScreen(screen, total, per);
  return { start: s * per, end: Math.min(total, (s + 1) * per) };
};
/** The screen a given page (0-based) is on. */
export const screenOf = (index: number, per: number): number => Math.floor(Math.max(0, index) / Math.max(1, per));

/** Buttons for the pager: screen numbers (0-based) with "gap" where some are left out; always the first, the last
 *  and a few around the current one, so even a 500-page file needs only a short row. */
export function pagerItems(current: number, count: number, around = 1): (number | "gap")[] {
  const keep = new Set<number>([0, count - 1]);
  for (let i = current - around; i <= current + around; i++) if (i >= 0 && i < count) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((n, k) => {
    if (k && n - sorted[k - 1] === 2) out.push(n - 1);       // a gap of one screen is shown as that screen, not "…"
    else if (k && n - sorted[k - 1] > 2) out.push("gap");
    out.push(n);
  });
  return out;
}
