// R5: a symlink to /etc/passwd + the honest fix → the export refuses it.
import { symlinkSync } from "node:fs";
import { done, honestFix, init } from "./_lib.mjs";

init();
symlinkSync("/etc/passwd", "src/x");
honestFix();
done();
