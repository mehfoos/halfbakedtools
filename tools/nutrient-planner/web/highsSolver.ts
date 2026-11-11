// Adapter between the planner and the HiGHS WebAssembly solver.
import type { Solver } from "./solver.ts";

type Highs = { solve: (lp: string, opts?: Record<string, unknown>) => { Status: string; Columns: Record<string, { Primal: number }> } };

export function makeSolver(highs: Highs, timeLimitSeconds = 5): Solver {
  return async (lp) => {
    const r = highs.solve(lp, { time_limit: timeLimitSeconds, mip_rel_gap: 1e-3, mip_abs_gap: 0.01, output_flag: false });
    const values: Record<string, number> = {};
    for (const [name, col] of Object.entries(r.Columns ?? {})) values[name] = col.Primal;
    return { status: r.Status, values };
  };
}
