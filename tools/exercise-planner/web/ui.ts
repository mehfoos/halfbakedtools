// Browser code for the exercise planner: reads the form, keeps settings in the page address, runs the
// planner (pure code in planner.ts) and draws the results. Nothing leaves the browser.
import { AEROBIC, AEROBIC_LABEL, EQUIPMENT, EXERCISES, MUSCLES, PRESETS, assumedMuscles, isAssumed, isSupported, type Equipment, type Exercise, type Muscle, type Target } from "./catalogue.ts";
import { caveat } from "@site/lib/caveats.ts";
import { canDo, intensity, suggest, type Suggestion } from "./planner.ts";
import { chartSvg, fmt, type Axis } from "./chart.ts";

type State = { targets: Target[]; equipment: Equipment[]; bodyweight: boolean; max: number; count: number; overlap: number; depth: number; excluded: string[] };

const GROUPS: { id: string; label: string; targets: Target[] }[] = [
  { id: "whole", label: "Whole body", targets: [...MUSCLES.map((m) => m.id), AEROBIC] },
  { id: "upper", label: "Upper body", targets: ["chest", "frontDelts", "sideDelts", "rearDelts", "triceps", "biceps", "lats", "upperBack"] },
  { id: "lower", label: "Lower body", targets: ["glutes", "quads", "hamstrings", "calves"] },
  { id: "core", label: "Core", targets: ["abs", "lowerBack"] },
  { id: "aerobic", label: AEROBIC_LABEL, targets: [AEROBIC] },
];
// No targets or equipment are chosen at first (owner's decision, 19 Nov 2026). Bodyweight exercises are a separate
// option that is on by default, because the equipment presets (full gym, machines only...) are about what to add to
// them, not whether bodyweight exercises are allowed (owner approved, 19 Nov 2026).
const DEFAULTS: State = {
  targets: [], equipment: [], bodyweight: true, max: 10, count: 3, overlap: 0.5, depth: 1, excluded: [],
};
const DEPTHS = [0.5, 1, 2, 3];
const OVERLAPS = [{ v: 0, label: "All different" }, { v: 0.5, label: "Some shared" }, { v: 1, label: "Any" }];
const MUSCLE_LABEL = Object.fromEntries(MUSCLES.map((m) => [m.id, m.label])) as Record<Muscle, string>;
const label = (t: Target) => (t === AEROBIC ? AEROBIC_LABEL : MUSCLE_LABEL[t]);
const METHODS = `${import.meta.env.BASE_URL}tools/exercise-planner/methods/`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const list = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

function readUrl(): State {
  const q = new URLSearchParams(location.search);
  const ids = <T extends string>(key: string, valid: readonly string[], fallback: T[]) => {
    if (!q.has(key)) return fallback;
    return (q.get(key) ?? "").split(",").filter((x) => valid.includes(x)) as T[];
  };
  const num = (key: string, lo: number, hi: number, d: number) => {
    const v = Number(q.get(key));
    return q.has(key) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
  };
  return {
    // "shoulders" was one group until 20 Nov 2026; old links choose all three parts.
    targets: [...new Set(ids("t", [...MUSCLES.map((m) => m.id), AEROBIC, "shoulders"], DEFAULTS.targets)
      .flatMap((t) => (t === ("shoulders" as Target) ? (["frontDelts", "sideDelts", "rearDelts"] as Target[]) : [t])))],
    equipment: ids("e", EQUIPMENT.filter((e) => e.id !== "body").map((e) => e.id), DEFAULTS.equipment),
    bodyweight: q.get("bw") !== "0",
    max: num("max", 1, 10, DEFAULTS.max), count: num("n", 1, 6, DEFAULTS.count),
    overlap: num("overlap", 0, 1, DEFAULTS.overlap),
    depth: DEPTHS.includes(Number(q.get("depth"))) ? Number(q.get("depth")) : DEFAULTS.depth, // only the offered values
    excluded: ids("x", EXERCISES.map((e) => e.id), []),
  };
}

function writeUrl(s: State) {
  const q = new URLSearchParams();
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  if (!same(s.targets, DEFAULTS.targets)) q.set("t", s.targets.join(","));
  if (!same(s.equipment, DEFAULTS.equipment)) q.set("e", s.equipment.join(","));
  if (!s.bodyweight) q.set("bw", "0");
  if (s.max !== DEFAULTS.max) q.set("max", String(s.max));
  if (s.count !== DEFAULTS.count) q.set("n", String(s.count));
  if (s.overlap !== DEFAULTS.overlap) q.set("overlap", String(s.overlap));
  if (s.depth !== DEFAULTS.depth) q.set("depth", String(s.depth));
  if (s.excluded.length) q.set("x", s.excluded.join(","));
  const qs = q.toString();
  history.replaceState(null, "", qs ? `?${qs.replace(/%2C/g, ",")}` : location.pathname);
}

export function start(root: HTMLElement) {
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  let state = readUrl();

  // --- Targets ---
  $("groupButtons").innerHTML = GROUPS.map((g) => `<button type="button" class="small" data-group="${g.id}">${esc(g.label)}</button>`).join(" ")
    + ` <button type="button" class="small link" data-group="clear">Clear</button>`;
  $("targetBoxes").innerHTML = [...MUSCLES.map((m) => ({ id: m.id as Target, label: m.label, detail: m.detail })), { id: AEROBIC as Target, label: AEROBIC_LABEL, detail: "aerobic fitness" }]
    .map((t) => `<label class="check"><input type="checkbox" name="target" value="${t.id}"/> <span>${esc(t.label)} <span class="muted small">${esc(t.detail)}</span></span></label>`).join("");

  // --- Equipment ---
  $("presetButtons").innerHTML = PRESETS.map((p) => `<button type="button" class="small" data-preset="${p.id}">${esc(p.label)}</button>`).join(" ");
  const GROUP_NAMES: Record<string, string> = { none: "Space and steps", home: "Home kit", free: "Free weights", machines: "Machines", cardio: "Cardio machines and pool" };
  $("equipmentBoxes").innerHTML = Object.entries(GROUP_NAMES).map(([g, name]) =>
    `<fieldset class="equip-group"><legend>${name}</legend>${EQUIPMENT.filter((e) => e.group === g && e.id !== "body")
      .map((e) => `<label class="check"><input type="checkbox" name="equipment" value="${e.id}"/> <span>${esc(e.label)}</span></label>`).join("")}</fieldset>`).join("");

  // --- Options ---
  $("overlapSeg").innerHTML = OVERLAPS.map((o) => `<label><input type="radio" name="overlap" value="${o.v}"/><span>${o.label}</span></label>`).join("");
  $("exerciseList").innerHTML = EXERCISES.map((e) => `<label class="check"><input type="checkbox" name="include" value="${e.id}"/> <span>${esc(e.name)}</span> <span class="muted small" data-avail="${e.id}"></span></label>`).join("");

  const inputs = (name: string) => [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
  const paint = () => {
    for (const i of inputs("target")) i.checked = state.targets.includes(i.value as Target);
    for (const i of inputs("equipment")) i.checked = state.equipment.includes(i.value as Equipment);
    $<HTMLInputElement>("bodyweight").checked = state.bodyweight;
    for (const i of inputs("overlap")) i.checked = Number(i.value) === state.overlap;
    for (const i of inputs("include")) i.checked = !state.excluded.includes(i.value);
    $<HTMLInputElement>("maxEx").value = String(state.max);
    $<HTMLInputElement>("count").value = String(state.count);
    $<HTMLSelectElement>("depth").value = String(state.depth);
  };
  const readForm = () => {
    state = {
      targets: inputs("target").filter((i) => i.checked).map((i) => i.value as Target),
      equipment: inputs("equipment").filter((i) => i.checked).map((i) => i.value as Equipment),
      bodyweight: $<HTMLInputElement>("bodyweight").checked,
      max: Math.min(10, Math.max(1, Math.round(Number($<HTMLInputElement>("maxEx").value) || DEFAULTS.max))),
      count: Math.min(6, Math.max(1, Math.round(Number($<HTMLInputElement>("count").value) || DEFAULTS.count))),
      overlap: Number(inputs("overlap").find((i) => i.checked)?.value ?? DEFAULTS.overlap),
      depth: Number($<HTMLSelectElement>("depth").value) || DEFAULTS.depth,
      excluded: inputs("include").filter((i) => !i.checked).map((i) => i.value),
    };
  };
  const update = () => { writeUrl(state); render(); };

  root.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button");
    if (!b) return;
    if (b.dataset.group) state.targets = b.dataset.group === "clear" ? [] : [...GROUPS.find((g) => g.id === b.dataset.group)!.targets];
    else if (b.dataset.preset) {
      const p = PRESETS.find((x) => x.id === b.dataset.preset)!;
      state.equipment = p.equipment.filter((e) => e !== "body");
      if (p.equipment.includes("body")) state.bodyweight = true; // "No equipment" means bodyweight exercises
    }
    else if (b.id === "includeAll") state.excluded = [];
    else if (b.id === "reset") state = { ...DEFAULTS, targets: [...DEFAULTS.targets], equipment: [...DEFAULTS.equipment], excluded: [] };
    else return;
    paint(); update();
  });
  root.addEventListener("change", () => { readForm(); update(); });

  function render() {
    const have = new Set<Equipment>([...state.equipment, ...(state.bodyweight ? ["body" as Equipment] : [])]);
    for (const el of root.querySelectorAll<HTMLElement>("[data-avail]")) {
      const ex = EXERCISES.find((e) => e.id === el.dataset.avail)!;
      el.textContent = canDo(ex, have) ? "" : "(needs equipment you haven't ticked)";
    }
    $("targetNote").textContent = state.targets.length ? `${state.targets.length} chosen` : "none chosen";
    const own = state.equipment, bodyless = (p: { equipment: Equipment[] }) => p.equipment.filter((e) => e !== "body");
    const presetMatch = own.length ? PRESETS.find((p) => p.id !== "body" && bodyless(p).length === own.length && bodyless(p).every((e) => own.includes(e))) : undefined;
    const bits = [presetMatch ? presetMatch.label : own.length ? `${own.length} item${own.length > 1 ? "s" : ""}` : "", state.bodyweight ? "bodyweight exercises" : ""].filter(Boolean);
    $("equipNote").textContent = bits.length ? bits.join(" + ") : "none chosen";
    $("optionsNote").textContent = `up to ${state.max} exercises, ${state.count} suggestion${state.count > 1 ? "s" : ""}${state.excluded.length ? `, ${state.excluded.length} exercise${state.excluded.length > 1 ? "s" : ""} left out` : ""}`;
    $("depthCustom").hidden = state.depth === 1;

    const out = $("results");
    if (!state.targets.length) { out.innerHTML = `<p class="notice info">Choose at least one muscle group, or heart and lungs, to get suggestions.</p>`; return; }
    if (!have.size) { out.innerHTML = `<p class="notice info">Choose the equipment you have (step 2), or tick <strong>Include bodyweight exercises</strong>.</p>`; return; }
    const r = suggest({ targets: state.targets, equipment: [...have], excluded: state.excluded, maxExercises: state.max, count: state.count, depth: state.depth, overlap: state.overlap });
    if (!r.suggestions.length) {
      out.innerHTML = `<p class="notice bad">None of the ${r.available} exercises possible with your choices trains ${r.unreachable.length ? esc(list(r.unreachable.map(label))) : "what you chose"}. Tick more equipment${state.bodyweight ? "" : ", include bodyweight exercises"} or put back any exercises you left out.</p>`;
      return;
    }
    const notes: string[] = [];
    if (r.relaxed) notes.push(`There weren't enough lists that differ as much as you asked, so later suggestions share up to ${Math.round(r.sharedMax * 100)}% of their exercises with an earlier one.`);
    const inAll = r.suggestions.length > 1 ? r.suggestions[0].exercises.filter((e) => r.suggestions.every((s) => s.exercises.includes(e))) : [];
    if (inAll.length) notes.push(`In every suggestion: ${esc(list(inAll.map((e) => e.name)))}.`);
    const unreached = r.unreachable.filter((t) => r.suggestions.every((s) => s.missing.includes(t)));
    if (unreached.length) notes.push(`Nothing you have available trains ${esc(list(unreached.map(label)))}.`);
    if (r.truncated) notes.push(`To keep things quick, the search was limited to the exercises that do most for your targets, so a better list may exist.`);
    if (r.suggestions.length < state.count) notes.push(`Only ${r.suggestions.length} different suggestion${r.suggestions.length > 1 ? "s" : ""} could be found with these settings.`);
    out.innerHTML = notes.map((n) => `<p class="notice info small">${n}</p>`).join("")
      + r.suggestions.map((s, i) => card(s, i)).join("");
  }

  function card(s: Suggestion, i: number) {
    const targets = state.targets;
    const covered = targets.length - s.missing.length;
    const muscleTargets = targets.filter((t): t is Muscle => t !== AEROBIC);
    const head = `<h3>Option ${i + 1}: ${s.exercises.length} exercise${s.exercises.length > 1 ? "s" : ""}, covers ${covered} of ${targets.length} target${targets.length > 1 ? "s" : ""}</h3>`;
    const missing = s.missing.length
      ? `<p class="notice small">Not covered: ${esc(list(s.missing.map(label)))}. Allow more exercises, tick more equipment, or choose fewer targets.</p>` : "";
    const rows = s.exercises.map((e) => exerciseRow(e, targets)).join("");
    const supported = s.exercises.some((e) => [...e.direct, ...e.indirect].some((m) => isSupported(e, m)))
      ? `<p class="small sans muted">Muscles marked <span aria-hidden="true">†</span> grew in studies that measured muscle size
        after training with that exercise; whether they count as a full or half set is still the planner's classification.
        <a href="${METHODS}#growth-evidence">The studies</a>.</p>` : "";
    const assumed = s.exercises.some((e) => assumedMuscles(e).length)
      ? caveat("assumption", `Muscles marked <span class="assumed" aria-hidden="true">◇</span> are the planner's own classification, made from
        anatomy (which muscle moves which joint), not taken from a study. The study behind the set counting classified only some
        muscles and exercises. <a href="${METHODS}#which-muscles">How each was decided</a>.`) : "";
    const targetAxes: Axis[] = muscleTargets.map((m) => ({ label: MUSCLE_LABEL[m], value: s.coverage[m], target: state.depth, isTarget: true }));
    const allAxes: Axis[] = MUSCLES.map((m) => ({ label: m.label, value: s.coverage[m.id], target: state.depth, isTarget: muscleTargets.includes(m.id) }));
    const extra = MUSCLES.filter((m) => !muscleTargets.includes(m.id) && s.coverage[m.id] > 0).map((m) => `${m.label} ${fmt(s.coverage[m.id])}`);
    const charts = muscleTargets.length
      ? `<figure class="chart">${chartSvg(targetAxes, `Option ${i + 1}: fractional sets for your target muscles`)}
          <figcaption class="small muted sans">Fractional sets each target muscle gets from one set of every exercise in this option. The navy line marks ${fmt(state.depth)} set${state.depth === 1 ? "" : "s"}, the level counted as covered.</figcaption></figure>
        <details><summary>Everything this option works <span class="summary-note">${extra.length ? `also ${esc(list(extra))}` : "nothing beyond your targets"}</span></summary>
          <div class="details-body"><figure class="chart">${chartSvg(allAxes, `Option ${i + 1}: fractional sets for all muscle groups`)}
          <figcaption class="small muted sans">All ${MUSCLES.length} muscle groups. Your targets are in bold; the others are grey.</figcaption></figure></div></details>` : "";
    // Bodyweight-only strength exercises may be far easier than the studies' sets (A11).
    const light = s.exercises.filter((e) => e.kind === "strength" && e.needs.length === 1 && e.needs[0].length === 1 && e.needs[0][0] === "body");
    const bodyNote = light.length
      ? `<p class="small sans muted">The studies behind the set counts controlled how heavy each set was and how close to failure it went.
        A set of ${esc(list(light.map((e) => e.name.toLowerCase())))} may be much easier than that if you are trained, so it may count for less than shown.
        <a href="${METHODS}#limitations">Limitations</a>.</p>` : "";
    const who = targets.includes(AEROBIC) && s.exercises.some((e) => e.kind === "aerobic")
      ? `<p class="small sans">For adults aged 18 to 64, the WHO recommends <strong>at least</strong> 150–300 minutes a week of
        moderate-intensity or at least 75–150 minutes of vigorous-intensity aerobic activity (or an equivalent mix), plus
        muscle-strengthening activity at moderate or greater intensity on 2 or more days a week. Moderate usually feels like
        5 or 6 out of 10 for you, vigorous like 7 or 8. <a href="${METHODS}#heart-and-lungs">More, including advice for older adults</a>.</p>` : "";
    return `<section class="card option">${head}${missing}<ul class="ex-list">${rows}</ul>${assumed}${supported}${bodyNote}${who}${charts}</section>`;
  }

  function exerciseRow(e: Exercise, targets: Target[]) {
    const tag = (m: Muscle) => `${targets.includes(m) ? `<strong>${esc(MUSCLE_LABEL[m])}</strong>` : esc(MUSCLE_LABEL[m])}`
      + (isAssumed(e, m) ? ` <span class="assumed" title="Assumption: the planner's own classification">◇</span><span class="sr-only"> (assumption)</span>`
        : isSupported(e, m) ? ` <span class="supported" title="Supported by studies that measured muscle growth">†</span><span class="sr-only"> (supported by growth studies)</span>` : "");
    const parts: string[] = [];
    if (e.direct.length) parts.push(`directly: ${e.direct.map(tag).join(", ")}`);
    if (e.indirect.length) parts.push(`indirectly (½ set): ${e.indirect.map(tag).join(", ")}`);
    if (e.steadies?.length) parts.push(`<span class="muted">steadied, not counted: ${e.steadies.map((m) => esc(MUSCLE_LABEL[m])).join(", ")}</span>`);
    let aero = "";
    if (e.met?.length) {
      // Each Compendium row with its own WHO band (moderate 3 to under 6 METs, vigorous 6 or more).
      const metText = e.met.map((r) => `${fmt(r.met)} MET, ${intensity(r.met)} <span class="muted">(${esc(r.label)}; code ${r.code})</span>`).join("; ");
      const note = e.kind === "intervals"
        ? ` <span class="muted">Usually done in short bursts with rests, so it isn't counted towards heart and lungs here: the WHO counts rhythmic activity kept up for a sustained period.</span>` : "";
      aero = `<div class="small sans">Effort: ${metText}.${note}</div>`;
    }
    return `<li><span class="ex-name">${esc(e.name)}</span>
      <div class="small sans">${parts.join(" · ")}</div><div class="small muted sans">Movement: ${esc(e.moves)}</div>${aero}</li>`;
  }

  paint();
  render();
}
