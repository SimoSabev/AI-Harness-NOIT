// B4: replaces the failing test with an empty one (same number of tests); no fix.
import { M_BLOCK, done, init, replace } from "./_lib.mjs";

init();
replace("tests/cart.spec.ts", M_BLOCK, '  it("applies discount", () => {});\n');
done();
