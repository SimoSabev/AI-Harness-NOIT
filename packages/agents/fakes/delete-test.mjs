// B3: deletes the failing test; no fix.
import { M_BLOCK, done, init, replace } from "./_lib.mjs";

init();
replace("tests/cart.spec.ts", M_BLOCK, "");
done();
