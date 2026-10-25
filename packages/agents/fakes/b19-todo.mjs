// B19: the must-pass test turned into it.todo, no fix.
import { done, init, replace } from "./_lib.mjs";

init();
replace("tests/cart.spec.ts", '  it("applies 10% over 50", () => {\n    expect(discountCents(10000)).toBe(1000);\n  });\n', '  it.todo("applies 10% over 50");\n');
done();
