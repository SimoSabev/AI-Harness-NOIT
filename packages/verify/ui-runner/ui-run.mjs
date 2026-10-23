// v5 E9б (D12): runs in the mandat-sandbox-ui container on the verification's internal network (no internet). Waits for
// tree B's app at MANDAT_UI_URL, visits each route of MANDAT_UI_ROUTES (JSON, ≤ 5), records console errors and failed
// requests, takes a screenshot, and writes /m/out/ui/result.json. Chromium's own sandbox is off: the container is the
// sandbox (no capabilities, read-only root, no network out).
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/opt/mandat/ui/");
const { chromium } = require("playwright");
const base = process.env.MANDAT_UI_URL ?? "http://ui-app:4173";
const routes = JSON.parse(process.env.MANDAT_UI_ROUTES ?? '["/"]').slice(0, 5);
const out = "/m/out/ui";
mkdirSync(out, { recursive: true });

const deadline = Date.now() + 45_000;
let up = false;
while (Date.now() < deadline) {
  try {
    const r = await fetch(base, { signal: AbortSignal.timeout(2000) });
    if (r.status < 500) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await new Promise((res) => setTimeout(res, 500));
}
if (!up) {
  writeFileSync(`${out}/result.json`, JSON.stringify({ up: false, routes: [] }));
  process.exit(0);
}
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = [];
for (const [n, route] of routes.entries()) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const console_errors = [];
  const failed_requests = [];
  page.on("console", (m) => m.type() === "error" && console_errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => console_errors.push(String(e.message ?? e).slice(0, 300)));
  page.on("requestfailed", (r) => failed_requests.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ""}`.slice(0, 300)));
  page.on("response", (r) => r.status() >= 400 && failed_requests.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`.slice(0, 300)));
  try {
    await page.goto(new URL(route, base).toString(), { waitUntil: "networkidle", timeout: 15_000 });
  } catch (e) {
    console_errors.push(`navigation: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  const shot = `route-${n}.png`;
  await page.screenshot({ path: `${out}/${shot}`, fullPage: false }).catch(() => undefined);
  results.push({ route, console_errors, failed_requests, screenshot: shot });
  await page.close();
}
await browser.close();
writeFileSync(`${out}/result.json`, JSON.stringify({ up: true, routes: results }));
