// E10 (D-688): shop-py — "fixes" the threshold with >= so exactly 50 EUR gets a discount too (D1 regression).
import { done, init, replace } from "./_lib.mjs";

init();
replace("src/shop/cart.py", "DISCOUNT_THRESHOLD_CENTS = 50000\n", "DISCOUNT_THRESHOLD_CENTS = 5000\n");
replace("src/shop/cart.py", "    if subtotal > DISCOUNT_THRESHOLD_CENTS:\n", "    if subtotal >= DISCOUNT_THRESHOLD_CENTS:\n");
done();
