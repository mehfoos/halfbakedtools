// Planner settings: defaults, page-address (URL) encoding, file export/import,
// and the optional, opt-in "remember on this device" storage.
import type { Override } from "./solver.ts";

export type Settings = {
  standard: string;
  profile: string;
  weight: number | null;          // null = use the profile's default
  diet: "vegetarian" | "vegan";
  n: number;                      // maximum number of ingredients
  options: number;                // how many alternative plans
  energyLow: number | null;       // null = use the profile's default band
  energyHigh: number | null;
  excluded: string[];             // food ids the user has unticked
  overrides: Record<string, Override>;
};

export const DEFAULTS: Settings = {
  standard: "uk", profile: "female-19-50", weight: null, diet: "vegetarian",
  n: 6, options: 3, energyLow: null, energyHigh: null, excluded: [], overrides: {},
};

const STORAGE_KEY = "halfbakedtools.nutrient-planner.v1";

const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

const int = (v: string | null, lo: number, hi: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};

export function encode(s: Settings): string {
  const p = new URLSearchParams();
  p.set("s", s.standard);
  p.set("p", s.profile);
  if (s.weight !== null) p.set("w", String(s.weight));
  p.set("d", s.diet);
  p.set("n", String(s.n));
  p.set("o", String(s.options));
  if (s.energyLow !== null) p.set("el", String(s.energyLow));
  if (s.energyHigh !== null) p.set("eh", String(s.energyHigh));
  if (s.excluded.length) p.set("x", s.excluded.join("."));
  if (Object.keys(s.overrides).length) p.set("t", toB64(JSON.stringify(s.overrides)));
  return p.toString();
}

export function decode(query: string): Settings {
  const p = new URLSearchParams(query);
  const s: Settings = { ...DEFAULTS, excluded: [], overrides: {} };
  if (p.get("s")) s.standard = p.get("s")!;
  if (p.get("p")) s.profile = p.get("p")!;
  s.weight = int(p.get("w"), 10, 300);
  if (p.get("d") === "vegan") s.diet = "vegan";
  s.n = int(p.get("n"), 1, 15) ?? DEFAULTS.n;
  s.options = int(p.get("o"), 1, 5) ?? DEFAULTS.options;
  s.energyLow = int(p.get("el"), 300, 6000);
  s.energyHigh = int(p.get("eh"), 300, 6000);
  if (p.get("x")) s.excluded = p.get("x")!.split(".").filter(Boolean);
  if (p.get("t")) {
    try {
      const o = JSON.parse(fromB64(p.get("t")!));
      if (o && typeof o === "object") s.overrides = o;
    } catch { /* ignore a damaged link */ }
  }
  return s;
}

export function exportFile(s: Settings): Blob {
  return new Blob([JSON.stringify({ tool: "nutrient-planner", version: 1, settings: s }, null, 2)], { type: "application/json" });
}

export async function importFile(file: File): Promise<Settings> {
  const data = JSON.parse(await file.text());
  if (data?.tool !== "nutrient-planner" || !data.settings) throw new Error("This isn't a nutrient planner settings file.");
  return decode(encode({ ...DEFAULTS, ...data.settings })); // round-trip to validate
}

// Opt-in local storage. Nothing is written unless the user ticks "remember".
export function loadRemembered(): Settings | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? decode(raw) : null;
  } catch { return null; }
}
export function remember(s: Settings) {
  try { localStorage.setItem(STORAGE_KEY, encode(s)); } catch { /* storage unavailable */ }
}
export function forget() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}
