// E3в: fake Codex, the honest fix (the same change as B1) with Codex JSONL.
import { honestFix } from "./_lib.mjs";
import { changed, finish, start } from "./_codex.mjs";

start();
honestFix();
changed("src/cart.ts");
finish("Fixed the discount threshold in src/cart.ts.");
