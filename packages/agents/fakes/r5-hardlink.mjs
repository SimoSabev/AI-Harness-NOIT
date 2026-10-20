// R5: a hard link inside the work tree.
import { linkSync } from "node:fs";
import { done, init } from "./_lib.mjs";

init();
linkSync("src/cart.ts", "src/cart2.ts");
done();
