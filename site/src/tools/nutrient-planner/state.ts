// Planner settings: defaults, page-address (URL) encoding, file export/import,
// and the optional, opt-in "remember on this device" storage.
import type { Override } from "./solver.ts";
import type { Base, Diet } from "./foods.ts";
import type { LifeStage, Sex } from "./profiles.ts";

export type BuilderItem = { id: string; grams: number };

export type Settings = {
  sex: Sex;
  age: number;
  weight: number | null;          // null = default for sex
  diet: Diet;
  standard: string;
  life: LifeStage;
  n: number;                      // maximum number of ingredients
  options: number;                // how many alternative plans
  energyLow: number | null;       // null = recommended band
  energyHigh: number | null;
  base: Base;                     // food preset
  toggled: string[];              // food ids switched away from the preset
  overrides: Record<string, Override>;
  mode: "suggest" | "build";
  builder: BuilderItem[];
};

export const DEFAULTS: Settings = {
  sex: "female", age: 35, weight: null, diet: "none", standard: "uk", life: "none",
  n: 6, options: 3, energyLow: null, energyHigh: null, base: "common", toggled: [], overrides: {},
  mode: "suggest", builder: [],
};

export const fresh = (): Settings => ({ ...DEFAULTS, toggled: [], overrides: {}, builder: [] });

const STORAGE_KEY = "halfbakedtools.nutrient-planner.v2";

const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
const clampInt = (v: string | null, lo: number, hi: number) => {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;
};
const ID_RE = /^[a-z0-9-]{1,40}$/;

export function encode(s: Settings): string {
  const p = new URLSearchParams();
  p.set("sex", s.sex === "male" ? "m" : "f");
  p.set("age", String(s.age));
  if (s.weight !== null) p.set("w", String(s.weight));
  if (s.diet !== "none") p.set("d", s.diet === "vegan" ? "vegan" : "veg");
  if (s.standard !== "uk") p.set("s", s.standard);
  if (s.life !== "none") p.set("ls", s.life);
  if (s.n !== DEFAULTS.n) p.set("n", String(s.n));
  if (s.options !== DEFAULTS.options) p.set("o", String(s.options));
  if (s.energyLow !== null) p.set("el", String(s.energyLow));
  if (s.energyHigh !== null) p.set("eh", String(s.energyHigh));
  if (s.base !== "common") p.set("f", s.base);
  if (s.toggled.length) p.set("x", s.toggled.join("."));
  if (Object.keys(s.overrides).length) p.set("t", toB64(JSON.stringify(s.overrides)));
  if (s.mode === "build") p.set("mode", "build");
  if (s.builder.length) p.set("b", s.builder.map((b) => `${b.id}~${Math.round(b.grams * 10) / 10}`).join("_"));
  return p.toString();
}

export function decode(query: string): Settings {
  const p = new URLSearchParams(query);
  const s = fresh();
  s.sex = p.get("sex") === "m" ? "male" : "female";
  s.age = clampInt(p.get("age"), 1, 110) ?? DEFAULTS.age;
  s.weight = clampInt(p.get("w"), 10, 300);
  const d = p.get("d");
  if (d === "vegan") s.diet = "vegan";
  else if (d === "veg" || d === "vegetarian") s.diet = "vegetarian";
  if (p.get("s") && /^[a-z]{2}$/.test(p.get("s")!)) s.standard = p.get("s")!;
  const ls = p.get("ls");
  if (ls === "pregnancy" || ls === "lactation") s.life = ls;
  s.n = clampInt(p.get("n"), 1, 15) ?? DEFAULTS.n;
  s.options = clampInt(p.get("o"), 1, 5) ?? DEFAULTS.options;
  s.energyLow = clampInt(p.get("el"), 300, 6000);
  s.energyHigh = clampInt(p.get("eh"), 300, 6000);
  const f = p.get("f");
  if (f === "all" || f === "none") s.base = f;
  if (p.get("x")) s.toggled = p.get("x")!.split(".").filter((id) => ID_RE.test(id));
  if (p.get("t")) {
    try {
      const o = JSON.parse(fromB64(p.get("t")!));
      if (o && typeof o === "object") {
        for (const [k, v] of Object.entries(o as Record<string, Override>)) {
          if (!/^[a-zA-Z0-9]{1,30}$/.test(k) || !v || typeof v !== "object") continue;
          const clean: Override = {};
          if (typeof v.min === "number" && Number.isFinite(v.min)) clean.min = v.min;
          if (typeof v.max === "number" && Number.isFinite(v.max)) clean.max = v.max;
          if (Object.keys(clean).length) s.overrides[k] = clean;
        }
      }
    } catch { /* ignore a damaged link */ }
  }
  if (p.get("mode") === "build") s.mode = "build";
  if (p.get("b")) {
    for (const part of p.get("b")!.split("_")) {
      const [id, g] = part.split("~");
      const grams = Number(g);
      if (ID_RE.test(id ?? "") && Number.isFinite(grams) && grams > 0 && grams < 5000) s.builder.push({ id, grams });
    }
  }
  return s;
}

export function exportFile(s: Settings): Blob {
  return new Blob([JSON.stringify({ tool: "nutrient-planner", version: 2, query: encode(s) }, null, 2)], { type: "application/json" });
}

export async function importFile(file: File): Promise<Settings> {
  const data = JSON.parse(await file.text());
  if (data?.tool !== "nutrient-planner" || typeof data.query !== "string") throw new Error("This isn't a nutrient planner settings file.");
  return decode(data.query);
}

// Opt-in local storage. Nothing is written unless the person ticks "remember".
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
