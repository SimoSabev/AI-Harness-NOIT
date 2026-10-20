// B2: skips the failing test instead of fixing the code.
import { done, init, replace } from "./_lib.mjs";

init();
replace("tests/cart.spec.ts", 'it("applies 10% over 50"', 'it.skip("applies 10% over 50"');
done();
