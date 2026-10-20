// R5: a nested .git directory.
import { mkdirSync, writeFileSync } from "node:fs";
import { done, init } from "./_lib.mjs";

init();
mkdirSync("src/.git", { recursive: true });
writeFileSync("src/.git/HEAD", "ref: refs/heads/main\n");
done();
