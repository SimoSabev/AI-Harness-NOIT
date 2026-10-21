// D-300: the honest fix + a new function no test calls. The tests stay green; Мандат's mutants of the new line survive → UNKNOWN.
import { appendFileSync } from "node:fs";
import { done, honestFix, init } from "./_lib.mjs";

init();
honestFix();
appendFileSync("src/cart.ts", "\nexport function freeShipping(subtotal: number): boolean {\n  return subtotal >= 9000;\n}\n");
done();
