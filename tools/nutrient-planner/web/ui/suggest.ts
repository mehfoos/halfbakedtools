// Section 3a, "Suggest foods for me": runs the optimiser in a Web Worker and shows each option as it arrives.
import { describeAmount, type Plan } from "../solver.ts";
import { ORDER } from "../analysis.ts";
import { planInput } from "../plan-input.ts";
import { DEFAULTS } from "../state.ts";
import type { App } from "./app.ts";
import { cite } from "./app.ts";
import type { Charts } from "./charts.ts";
import { CAVEAT, foodNotes } from "./notices.ts";
import { reportHtml } from "./report.ts";
import { $, clampInt, esc, int } from "./dom.ts";

/** `onAdjust(plan)` is called when the person presses "Adjust in builder" on an option. */
export function setupSuggest(app: App, charts: Charts, onAdjust: (plan: Plan) => void) {
  const { root } = app;
  const results = $(root, "#results");
  const status = $(root, "#status");
  const runBtn = $<HTMLButtonElement>(root, "#run");
  const nIn = $<HTMLInputElement>(root, "#n");
  const optIn = $<HTMLInputElement>(root, "#options");
  const vitdBox = $<HTMLInputElement>(root, "#vitd");
  let plans: Plan[] = [];
  let worker: Worker | null = null;

  const show = (html: string) => results.insertAdjacentHTML("beforeend", html);
  const bad = (text: string) => `<p class="notice bad">${text}</p>`;
  const aside = (text: string) => `<p class="small muted sans">${text}</p>`;

  /** Flag the suggestions on show as out of date; they are not recalculated until the person asks. */
  function markStale() {
    if (results.childElementCount && !results.querySelector(".stale")) {
      results.insertAdjacentHTML("afterbegin", `<p class="notice info stale">Settings changed. Press "Find combinations" to update these suggestions.</p>`);
    }
  }

  function optionHtml(plan: Plan, k: number) {
    const items = app.items(plan.items);
    return `<article class="result">
          <h3><span>Option ${k}</span><span class="result-actions"><button type="button" class="small" data-edit="${k - 1}">Adjust in builder</button></span></h3>
          <p class="small muted sans day-note">Amounts are totals for the whole day, to spread across meals and snacks as you like.</p>
          <ul class="ingredients">${items.map((i) => `<li><b>${esc(i.food.name)}</b> · ${esc(describeAmount(i.food, i.grams))} · <span class="kcal">${int(Math.round(((i.food.per100g.energy ?? 0) * i.grams) / 100))} kcal</span></li>`).join("")}</ul>
          ${plan.relaxed ? `<p class="notice info small">This option repeats more of the earlier options' foods than usual, because with the foods switched on a more varied combination would meet the targets less well. Switching more foods on gives more variety.</p>` : ""}
          ${plan.timedOut ? `<p class="notice info small">The search for this option was stopped at its 5-second limit, so this is the best combination found in that time; a better one may exist. Switching fewer foods on makes the search faster.</p>` : ""}
          ${reportHtml(app, charts, app.report(items), items)}
          ${foodNotes(app, items)}
        </article>`;
  }

  // What to say when the search ends with fewer options than asked for.
  function endMessage(timedOut: boolean) {
    const want = app.s.options, got = plans.length;
    if (!got && timedOut) return bad(`The search ran out of time (5 seconds) before finding a combination. That doesn't mean none exists. Try switching fewer foods on, or allowing more different foods.`);
    if (!got) return bad(`No combination fits all the limits. Try allowing more foods, widening the calorie range, or switching more foods on.`);
    if (got < want && timedOut) return aside(`The search for further options ran out of time.`);
    if (got < want) return aside(`Only ${got} distinct option${got > 1 ? "s" : ""} could be found with these settings.`);
    return "";
  }

  function run() {
    worker?.terminate();
    const s = app.s;
    const person = app.person();
    const selected = app.selectedFoods();
    if (!selected.length) { results.innerHTML = bad(`No foods are switched on. Open "Choose foods" above to pick some.`); return; }
    if (person.band.low > person.band.high) { results.innerHTML = bad(`The lower calorie value is higher than the upper one.`); return; }

    worker = new Worker(new URL("../worker.ts", import.meta.url), { type: "module" });
    runBtn.disabled = true;
    plans = [];
    results.innerHTML = CAVEAT;
    status.textContent = `Finding option 1 of ${s.options}…`;
    worker.onmessage = ({ data: d }) => {
      if (d.type === "plan") {
        plans.push(d.plan);
        show(optionHtml(d.plan, plans.length));
        status.textContent = plans.length < app.s.options ? `Finding option ${plans.length + 1} of ${app.s.options}…` : "";
        return;
      }
      // "done" or "error"
      runBtn.disabled = false;
      status.textContent = "";
      show(d.type === "error" ? bad(`Something went wrong: ${esc(d.message)}`) : endMessage(d.timedOut));
      worker?.terminate(); worker = null;
    };

    const { input, avoided } = planInput(selected, app.targets(true), s, person);
    if (avoided.length) show(aside(`Left out of these suggestions: ${avoided.map((r) => `${esc(r.text)} ${cite(r.ref)}`).join(" ")}`));
    worker.postMessage({ input, keys: ORDER });
  }

  runBtn.addEventListener("click", run);
  nIn.addEventListener("change", () => { app.s.n = clampInt(nIn.value, 1, 15, DEFAULTS.n); nIn.value = String(app.s.n); app.save(); markStale(); });
  vitdBox.addEventListener("change", () => { app.s.vitaminD = vitdBox.checked; app.save(); markStale(); });
  optIn.addEventListener("change", () => { app.s.options = clampInt(optIn.value, 1, 5, DEFAULTS.options); optIn.value = String(app.s.options); app.save(); });
  results.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-edit]") as HTMLButtonElement | null;
    if (btn) onAdjust(plans[Number(btn.dataset.edit)]);
  });

  return {
    markStale,
    /** Show the settings in the controls and clear any results (start-up and after importing settings). */
    reset() {
      nIn.value = String(app.s.n);
      optIn.value = String(app.s.options);
      vitdBox.checked = app.s.vitaminD;
      results.innerHTML = "";
    },
  };
}
