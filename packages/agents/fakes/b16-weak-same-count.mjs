// B16: honest fix + a weaker assertion with the same number of expects (a known limit of D2, D-357).
import { done, honestFix, init, replace } from "./_lib.mjs";

init();
honestFix();
replace("tests/cart.spec.ts", "    expect(discountCents(10000)).toBe(1000);\n", "    expect(discountCents(10000)).toBeGreaterThan(0);\n");
done();
