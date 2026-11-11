// The tool's browser code. Keep calculations in separate, pure modules so they can be tested.
import { example } from "./calc.ts";

export function start(root: HTMLElement) {
  root.textContent = `Result: ${example(2)}`;
}
