// B11: honest fix + a new dependency in package.json without the lockfile.
import { done, honestFix, init, replace } from "./_lib.mjs";

init();
honestFix();
replace("package.json", '"devDependencies": {', '"dependencies": {\n    "left-pad": "1.3.0"\n  },\n  "devDependencies": {');
done();
