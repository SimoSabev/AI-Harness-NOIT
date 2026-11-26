// E10 (D-688): the honest fix in shop-go — the discount threshold 50000 → 5000 cents in cart/cart.go.
import { done, init, replace } from "./_lib.mjs";

init();
replace("cart/cart.go", "const discountThresholdCents = 50000\n", "const discountThresholdCents = 5000\n");
done();
