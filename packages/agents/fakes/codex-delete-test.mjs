// E3в: fake Codex deletes test M (the same change as B3) → FAILED D2:missing_test.
import { M_BLOCK, replace } from "./_lib.mjs";
import { changed, finish, start } from "./_codex.mjs";

start();
replace("tests/cart.spec.ts", M_BLOCK, "");
changed("tests/cart.spec.ts");
finish("Removed a failing test.");
