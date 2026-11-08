// Runs the optimiser off the main thread so the page stays responsive.
import highsLoader from "highs";
import wasmUrl from "highs/runtime?url";
import { plan, type PlanInput } from "./solver.ts";
import { makeSolver } from "./highsSolver.ts";

let highsPromise: Promise<any> | null = null;
const getHighs = () => (highsPromise ??= highsLoader({ locateFile: () => wasmUrl }));

self.onmessage = async (e: MessageEvent<{ input: PlanInput; keys: string[] }>) => {
  try {
    const solve = makeSolver(await getHighs());
    const plans = await plan(e.data.input, solve, e.data.keys, (p) => self.postMessage({ type: "plan", plan: p }));
    self.postMessage({ type: "done", count: plans.length });
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
