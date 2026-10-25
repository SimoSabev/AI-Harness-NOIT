// B34 (D8): the honest fix + a type error the tests never see (vitest strips types); the project's typecheck catches it.
import { appendFileSync } from "node:fs";
import { done, honestFix, init } from "./_lib.mjs";

init();
honestFix();
appendFileSync("src/cart.ts", '\nexport const FREE_SHIPPING_CENTS: number = "9000";\n');
done();
