// Adapter between the planner and the HiGHS WebAssembly solver.
import type { Solver } from "./solver.ts";

type Highs = { solve: (lp: string, opts?: Record<string, unknown>) => { Status: string; Columns: Record<string, { Primal: number }> } };

// The search stops once it is within 0.003 of the best possible objective (0.3% of one target). That is
// tight enough for the mild preference for familiar foods (worth up to 0.01 a plan) to take effect.
export function makeSolver(highs: Highs, timeLimitSeconds = 5): Solver {
  return async (lp) => {
    const r = highs.solve(lp, { time_limit: timeLimitSeconds, mip_rel_gap: 1e-3, mip_abs_gap: 0.003, output_flag: false });
    const values: Record<string, number> = {};
    for (const [name, col] of Object.entries(r.Columns ?? {})) values[name] = col.Primal;
    return { status: r.Status, values };
  };
}
