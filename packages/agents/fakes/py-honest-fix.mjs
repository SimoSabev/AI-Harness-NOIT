// E10 (D-688): the honest fix in shop-py — the discount threshold 50000 → 5000 cents in src/shop/cart.py.
import { done, init, replace } from "./_lib.mjs";

init();
replace("src/shop/cart.py", "DISCOUNT_THRESHOLD_CENTS = 50000\n", "DISCOUNT_THRESHOLD_CENTS = 5000\n");
done();
