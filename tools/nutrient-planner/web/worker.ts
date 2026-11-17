// Runs the optimiser off the main thread so the page stays responsive.
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { plan, type PlanInput } from "./solver.ts";
import { makeSolver } from "./highsSolver.ts";

let highsPromise: Promise<any> | null = null;
const getHighs = () => (highsPromise ??= highsLoader({ locateFile: () => wasmUrl }));

self.onmessage = async (e: MessageEvent<{ input: PlanInput; keys: string[] }>) => {
  try {
    const base = makeSolver(await getHighs());
    let lastStatus = "";
    const solve: typeof base = async (lp) => { const r = await base(lp); lastStatus = r.status; return r; };
    const plans = await plan(e.data.input, solve, e.data.keys, (p) => self.postMessage({ type: "plan", plan: p }));
    // lastStatus tells the page whether the final search ended because it ran out of time
    self.postMessage({ type: "done", count: plans.length, timedOut: lastStatus === "Time limit reached" });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
