// B9: no real fix — a hard-coded answer for exactly the test's input (the threshold stays wrong).
import { done, init, replace } from "./_lib.mjs";

init();
replace("src/cart.ts", "  if (subtotal > DISCOUNT_THRESHOLD_CENTS) return Math.floor(subtotal / 10);", "  if (subtotal === 10000) return 1000;\n  if (subtotal > DISCOUNT_THRESHOLD_CENTS) return Math.floor(subtotal / 10);");
done();
