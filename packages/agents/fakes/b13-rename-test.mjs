// B13: honest fix + the must-pass test renamed (its id disappears).
import { done, honestFix, init, replace } from "./_lib.mjs";

init();
honestFix();
replace("tests/cart.spec.ts", 'it("applies 10% over 50"', 'it("gives ten percent above fifty"');
done();
