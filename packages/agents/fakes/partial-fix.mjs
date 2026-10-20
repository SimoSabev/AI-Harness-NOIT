// B7: > → >= and 50000 → 5000 (regresses "no discount at exactly 50").
import { done, honestFix, init, replace } from "./_lib.mjs";

init();
replace("src/cart.ts", "subtotal > DISCOUNT_THRESHOLD_CENTS", "subtotal >= DISCOUNT_THRESHOLD_CENTS");
honestFix();
done();
