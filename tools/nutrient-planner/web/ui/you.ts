// Section 1, "About you": sex, age and weight, the line saying which targets apply, and the
// "Fine-tune targets" panel (standard, life stage, calories, and a custom minimum or maximum per nutrient).
import type { ResolvedTarget } from "../solver.ts";
import { GROUPS } from "../analysis.ts";
import { isAdult } from "../profiles.ts";
import { DEFAULTS, type Settings } from "../state.ts";
import type { App } from "./app.ts";
import { cite } from "./app.ts";
import { $, $$, clampInt, esc, fmt, int, numOrNull } from "./dom.ts";

const longDate = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** `onChange` is called after any setting here changes. */
export function setupYou(app: App, onChange: () => void) {
  const { root } = app;
  const age = $<HTMLInputElement>(root, "#age");
  const weightIn = $<HTMLInputElement>(root, "#weight");
  const life = $<HTMLSelectElement>(root, "#life");
  $(root, "#standardSeg").innerHTML = app.standards.map((st) =>
    `<label><input type="radio" name="standard" value="${st.id}" ${st.status !== "available" ? "disabled" : ""} /><span>${esc(st.name)}${st.status !== "available" ? " (soon)" : ""}</span></label>`).join("");

  function render() {
    const s = app.s;
    const p = app.person();
    const std = p.standard;
    $$<HTMLInputElement>(root, 'input[name="sex"]').forEach((r) => (r.checked = r.value === s.sex));
    $$<HTMLInputElement>(root, 'input[name="standard"]').forEach((r) => (r.checked = r.value === std.id));
    age.value = String(s.age);
    weightIn.value = s.weight === null ? "" : String(s.weight);
    weightIn.placeholder = String(p.defaultWeight);
    life.value = p.life;
    (life.closest("label") as HTMLElement).style.display = s.sex === "female" ? "" : "none";

    // Which targets apply, and where they come from.
    $(root, "#profileLine").innerHTML =
      `Targets: <b>${esc(std.name)}</b> recommendations for <b>${esc(p.profile.label.toLowerCase().replace(/(\d)-(\d)/, "$1–$2"))}</b> · ${int(p.band.low)}–${int(p.band.high)} kcal a day`
      + (p.note ? ` <span class="muted">(${esc(p.note)})</span>` : "");
    const [main, ...rest] = std.sources;
    const v = std.verified;
    $(root, "#sourceLine").innerHTML = `Source: ${esc(main.title)} ${cite(main.id)}. ${rest.length ? rest.map((x) => `${esc(x.role ?? x.title)}: ${cite(x.id)}`).join("; ") + "." : ""}`
      + (v ? `<br>${v.checked ? `<b>Checked</b> against the original document (${esc(v.against)}) on ${esc(longDate(v.date!))}.` : `<b>Not yet checked against the original document.</b> ${esc(v.against)}.`}` : "")
      + (v?.pending ? ` <b>Not yet checked:</b> ${esc(v.pending)}` : "");
    $(root, "#unverified").hidden = !!v?.checked;

    const child = $(root, "#childNote");
    child.hidden = s.age >= 18;
    if (s.age < 5) child.innerHTML = `<b>Under 5:</b> treat this as a rough guide only. The UK tables note that reference values for certain nutrients aren't available for children under 5, and that children up to 5 should be given vitamin A, C and D supplements ${cite("phe-2016")}. ${app.kind === "finder" ? "This tool" : "Suggested amounts are adult portion limits scaled down by calories, and the planner"} knows nothing about textures, choking risks or foods unsuitable for young children. Ask a health visitor or GP.`;
    else if (s.age < 18) child.innerHTML = app.kind === "finder"
      ? `<b>For a child:</b> for anything beyond general interest, ask a GP or registered dietitian.`
      : `<b>Planning for a child:</b> suggested amounts are adult portion limits scaled down by the child's calories, which is a rule of thumb. For anything beyond general interest, ask a GP or registered dietitian.`;

    // Calories
    $<HTMLInputElement>(root, "#energyLow").value = String(p.band.low);
    $<HTMLInputElement>(root, "#energyHigh").value = String(p.band.high);
    $(root, "#energyNote").textContent = `Recommended: ${int(p.energy.low)}–${int(p.energy.high)} kcal. ${p.energy.note}`;
    $(root, "#energyCustom").hidden = !p.customEnergy;
    $(root, "#energyReset").hidden = !p.customEnergy;
    renderTargets();
  }

  // The table of targets by nutrient group, with boxes for a custom minimum and maximum.
  function renderTargets() {
    const s = app.s;
    const p = app.person();
    const official = new Map(app.targets(false).map((t) => [t.key, t]));
    const current = app.targets(true);
    const custom = current.filter((t) => t.custom).length + (p.customEnergy ? 1 : 0);
    $(root, "#customBanner").hidden = custom === 0;
    $(root, "#tuneNote").textContent = `${p.standard.name} · ${current.length} nutrient targets${custom ? ` · ${custom} custom` : ""}`;
    const openNow = new Set($$<HTMLDetailsElement>(root, "#targetGroups details[open]").map((d) => d.dataset.group));

    const ofEnergy = (t: ResolvedTarget) => t.minPerKcal !== undefined || t.maxPerKcal !== undefined;
    const input = (t: ResolvedTarget, bound: "min" | "max") => {
      const mine = s.overrides[t.key]?.[bound];
      const theirs = official.get(t.key)?.[bound];
      return `<input type="number" step="any" min="0" data-key="${t.key}" data-bound="${bound}" aria-label="${esc(t.label)} ${bound === "min" ? "minimum" : "maximum"}" value="${mine ?? ""}" placeholder="${theirs !== undefined ? fmt(theirs) : "none"}" />`;
    };
    const range = (t?: ResolvedTarget) => t ? ([t.min !== undefined ? `≥ ${fmt(t.min)}` : "", t.max !== undefined ? `≤ ${fmt(t.max)}` : ""].filter(Boolean).join(", ") || "–")
      + (ofEnergy(t) ? " *" : "") : "–";
    const midKcal = int(Math.round(p.midKcal));
    const notes: Record<string, string> = { amino: isAdult(s.age) ? `Amino acid safe intakes per kg of body weight (WHO 2007 ${cite("who-2007")}) worked out for ${p.weight} kg.` : "Amino acid targets are given for adults only." };

    $(root, "#targetGroups").innerHTML = GROUPS.map((g) => {
      const ts = current.filter((t) => g.keys.includes(t.key));
      if (!ts.length) return g.id === "amino" ? `<p class="small muted sans">${notes.amino}</p>` : "";
      const nCustom = ts.filter((t) => t.custom).length;
      return `<details data-group="${g.id}" ${openNow.has(g.id) ? "open" : ""}><summary>${esc(g.title)} <span class="summary-note">${ts.length} targets${nCustom ? `, ${nCustom} custom` : ""}</span></summary>
        <div class="details-body">${notes[g.id] ? `<p class="small sans">${notes[g.id]}</p>` : ""}<div class="table-scroll"><table>
        <thead><tr><th>Nutrient</th><th class="num">Official</th><th>Your minimum</th><th>Your maximum</th></tr></thead><tbody>
        ${ts.map((t) => `<tr><td>${esc(t.label)} <span class="muted">${esc(t.unit)}</span>${t.custom ? '<span class="badge">custom</span>' : ""}</td>
          <td class="num">${range(official.get(t.key))}</td><td>${input(t, "min")}</td><td>${input(t, "max")}</td></tr>`).join("")}
        </tbody></table></div>${ts.some(ofEnergy) ? `<p class="small muted sans">* Set as a share of energy. Shown here for ${midKcal} kcal (the middle of your calorie range); each plan is checked against its own calories.</p>` : ""}</div></details>`;
    }).join("");
  }

  // A change of person or standard puts the calorie range back to the recommended one.
  const resetEnergy = () => { app.s.energyLow = app.s.energyHigh = null; };

  $$<HTMLInputElement>(root, 'input[name="sex"]').forEach((r) => r.addEventListener("change", () => { app.s.sex = r.value as Settings["sex"]; resetEnergy(); onChange(); }));
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "standard") { app.s.standard = t.value; app.s.overrides = {}; resetEnergy(); onChange(); }
  });
  age.addEventListener("change", () => { app.s.age = clampInt(age.value, 1, 110, DEFAULTS.age); resetEnergy(); onChange(); });
  weightIn.addEventListener("change", () => {
    const w = numOrNull(weightIn.value);
    app.s.weight = w === null ? null : Math.min(300, Math.max(10, Math.round(w)));
    onChange();
  });
  life.addEventListener("change", () => { app.s.life = life.value as Settings["life"]; resetEnergy(); onChange(); });

  for (const [id, key, end] of [["#energyLow", "energyLow", "low"], ["#energyHigh", "energyHigh", "high"]] as const) {
    $<HTMLInputElement>(root, id).addEventListener("change", (e) => {
      const v = numOrNull((e.target as HTMLInputElement).value);
      // typing the recommended value back in counts as "not custom"
      app.s[key] = v === null || v === app.person().energy[end] ? null : Math.min(6000, Math.max(300, Math.round(v)));
      onChange();
    });
  }
  $(root, "#energyReset").addEventListener("click", () => { resetEnergy(); onChange(); });
  $(root, "#resetTargets").addEventListener("click", () => { app.s.overrides = {}; resetEnergy(); onChange(); });

  // A custom minimum or maximum typed into the targets table.
  $(root, "#targetGroups").addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    if (!box.dataset.key) return;
    const key = box.dataset.key, bound = box.dataset.bound as "min" | "max";
    const v = numOrNull(box.value);
    const o = { ...(app.s.overrides[key] ?? {}) };
    if (v === null) delete o[bound]; else o[bound] = v;
    if (Object.keys(o).length) app.s.overrides[key] = o; else delete app.s.overrides[key];
    onChange();
  });

  return { render };
}
