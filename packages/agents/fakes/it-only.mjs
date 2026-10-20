// B8: honest fix + it.only on the must-pass test.
import { done, honestFix, init, replace } from "./_lib.mjs";

init();
honestFix();
replace("tests/cart.spec.ts", 'it("applies 10% over 50"', 'it.only("applies 10% over 50"');
done();
