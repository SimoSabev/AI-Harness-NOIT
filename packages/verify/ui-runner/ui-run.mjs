// v5 E9б (D12): runs in the mandat-sandbox-ui container on the verification's internal network (no internet). Waits for
// tree B's app at MANDAT_UI_URL, visits each route of MANDAT_UI_ROUTES (JSON, ≤ 5), records console errors and failed
// requests, takes a screenshot, compares it with the base screenshot in /m/in/base (when there is one; D-364: share of
// pixels that differ by more than 16 in any channel, drawn on a canvas in the browser itself), and writes /m/out/ui/result.json. Chromium's own sandbox is off: the container is the
// sandbox (no capabilities, read-only root, no network out).
/* global Image -- the visual diff runs inside the page (page.evaluate) */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/opt/mandat/ui/");
const { chromium } = require("playwright");
const base = process.env.MANDAT_UI_URL ?? "http://ui-app:4173";
const routes = JSON.parse(process.env.MANDAT_UI_ROUTES ?? '["/"]').slice(0, 5);
const out = "/m/out/ui";
mkdirSync(out, { recursive: true });

// D-364: the whole check ≤ 60 s — the app has 30 s to answer, the routes share what is left
const t0 = Date.now();
const deadline = t0 + 30_000;
const budgetEnd = t0 + 60_000;
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
const dataUrl = (file) => `data:image/png;base64,${readFileSync(file).toString("base64")}`;
async function visualDiff(a, b) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ([x, y]) => {
      const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
      const [p, q] = await Promise.all([load(x), load(y)]);
      if (p.width !== q.width || p.height !== q.height) return 1;
      const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const m = px(p);
      const n = px(q);
      let diff = 0;
      for (let k = 0; k < m.length; k += 4) if (Math.abs(m[k] - n[k]) > 16 || Math.abs(m[k + 1] - n[k + 1]) > 16 || Math.abs(m[k + 2] - n[k + 2]) > 16) diff++;
      return diff / (m.length / 4);
    }, [a, b]);
  } catch {
    return null;
  } finally {
    await page.close();
  }
}
const results = [];
for (const [n, route] of routes.entries()) {
  const left = budgetEnd - Date.now();
  if (left < 2_000) {
    results.push({ route, console_errors: ["not visited: the 60 s budget ran out"], failed_requests: [], screenshot: null, visual_diff: null });
    continue;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const console_errors = [];
  const failed_requests = [];
  page.on("console", (m) => m.type() === "error" && console_errors.push(m.text().slice(0, 300)));
  page.on("pageerror", (e) => console_errors.push(String(e.message ?? e).slice(0, 300)));
  page.on("requestfailed", (r) => failed_requests.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText ?? ""}`.slice(0, 300)));
  page.on("response", (r) => r.status() >= 400 && failed_requests.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`.slice(0, 300)));
  try {
    await page.goto(new URL(route, base).toString(), { waitUntil: "networkidle", timeout: Math.min(15_000, left - 1_000) });
  } catch (e) {
    console_errors.push(`navigation: ${String(e?.message ?? e).slice(0, 200)}`);
  }
  const shot = `route-${n}.png`;
  await page.screenshot({ path: `${out}/${shot}`, fullPage: false }).catch(() => undefined);
  await page.close();
  const before = `/m/in/base/${shot}`;
  const visual_diff = existsSync(before) && existsSync(`${out}/${shot}`) ? await visualDiff(dataUrl(before), dataUrl(`${out}/${shot}`)) : null;
  results.push({ route, console_errors, failed_requests, screenshot: shot, visual_diff });
}
await browser.close();
writeFileSync(`${out}/result.json`, JSON.stringify({ up: true, routes: results }));
