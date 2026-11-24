// Eval entry point — the golden set and evaluation harness.
// This module is intentionally separate from the main index to keep test data
// out of the library runtime. Import explicitly:
//   import { GOLDEN, evaluate } from "@mandat/memory/eval";
export { GOLDEN, evaluate } from "./eval.js";
export type { EvalResult, GoldenCase } from "./eval.js";
