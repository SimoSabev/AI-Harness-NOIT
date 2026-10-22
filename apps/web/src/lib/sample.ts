import type { FleetRow, HomeExtras, McpRow, NightView, PermissionCell, PluginRow, ResearchView, SkillRow, ToolCallRow, WindowRow } from "./workbench";

// D-307: the sample that fills a screen while the system does not record that part yet (design H1–H6). Always shown
// with the "ПРИМЕР" mark; switched off in Настройки. Fixed times relative to now, so it never looks stale.
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); if (h < 12) d.setDate(d.getDate() + 1); return d.toISOString(); };

const f = (id: string, parent: string | null, repo: string, agent: string, model: string, account: string | null, role: FleetRow["role"], state: FleetRow["state"], step: string, ctx: number | null, usd: number, tools: string[], min: number): FleetRow =>
  ({ id, parent_id: parent, task_id: null, repo, agent, model, account, role, state, step, context_pct: ctx, usd, tools, started_at: ago(min) });

const fleet: FleetRow[] = [
  f("s_shop_cc1", null, "shop", "claude #1", "Claude Code · opus", "lichno", "lead", "waiting", "Одобрена · чака теб", 41, 0.42, ["github"], 18),
  f("s_shop_cc3", null, "shop", "claude #3", "Claude Code · sonnet", "work", "lead", "running", "тестове 3/5", 62, 0.31, ["playwright", "bash"], 6),
  f("s_shop_cc3_t", "s_shop_cc3", "shop", "тестове", "sonnet", "work", "subagent", "running", "Edit tests/signup.spec.ts", 23, 0.06, ["bash"], 2),
  f("s_shop_cc3_r", "s_shop_cc3", "shop", "ревю", "haiku", "work", "subagent", "running", "Read src/signup.ts", 11, 0.01, ["read"], 1),
  f("s_shop_cx2", null, "shop", "codex #2", "Codex", "API", "lead", "waiting", "пипа src/cart.ts като claude #1", 48, 0.22, ["github"], 9),
  f("s_api_cc4", null, "api-gateway", "claude #4", "Claude Code · opus", "lichno", "lead", "waiting", "Неясно · 2 мутанта оцеляха", 88, 0.77, ["github", "postgres"], 52),
  f("s_api_cx1", null, "api-gateway", "codex #1", "Codex", "API", "lead", "running", "агентът пише", 30, 0.12, ["postgres"], 4),
  f("s_api_m", null, "api-gateway", "Мандат", "съдия", null, "judge", "running", "умишлени повреди 2/3", null, 0, ["sandbox"], 1),
  f("s_ml_gm1", null, "ml-pipeline", "gemini #1", "Gemini CLI", "API", "lead", "failed", "Провал · тестът пада", 71, 0.54, ["s3"], 33),
  f("s_ml_ll1", null, "ml-pipeline", "local #1", "Qwen · локален", null, "lead", "idle", "чака задача", 0, 0, [], 120),
];

const mcp: McpRow[] = [
  { name: "github", transport: "http", tools: 26, status: "up", latency_ms: 12, egress_hosts: ["api.github.com"], repos: null, calls_hour: 940 },
  { name: "playwright", transport: "stdio", tools: 21, status: "up", latency_ms: null, egress_hosts: ["localhost"], repos: ["shop", "landing"], calls_hour: 410 },
  { name: "postgres", transport: "stdio", tools: 8, status: "up", latency_ms: 4, egress_hosts: ["db.internal:5432"], repos: ["api-gateway", "ml-pipeline"], calls_hour: 380 },
  { name: "stripe", transport: "http", tools: 14, status: "up", latency_ms: 80, egress_hosts: ["api.stripe.com"], repos: ["billing"], calls_hour: 120 },
  { name: "figma", transport: "http", tools: 9, status: "up", latency_ms: 140, egress_hosts: ["api.figma.com"], repos: ["design-system"], calls_hour: 64 },
  { name: "s3", transport: "stdio", tools: 6, status: "slow", latency_ms: 1400, egress_hosts: ["s3.eu-central-1"], repos: ["ml-pipeline"], calls_hour: 55 },
  { name: "web-search", transport: "http", tools: 3, status: "up", latency_ms: 300, egress_hosts: ["търсачка без бисквитки"], repos: ["docs"], calls_hour: 210 },
  { name: "slack", transport: "http", tools: 7, status: "off", latency_ms: null, egress_hosts: [], repos: [], calls_hour: 0 },
];
const skills: SkillRow[] = [
  { name: "test-first", description: "червен тест преди код", source: "repo", version: "1.2", used_by: 14 },
  { name: "http-retry", description: "повторения и таймаути", source: "user", version: null, used_by: 3 },
  { name: "forms", description: "достъпни форми", source: "team", version: "0.4", used_by: 4 },
  { name: "review", description: "чете разликата като ревюър", source: "builtin", version: null, used_by: 9 },
  { name: "python-env", description: "uv, venv, pytest", source: "team", version: "2.0", used_by: 4 },
  { name: "research", description: "източници с цитати", source: "builtin", version: null, used_by: 3 },
];
const plugins: PluginRow[] = [
  { name: "Присъдата на Мандат в PR", description: "check run", kind: "check", enabled: true },
  { name: "Известия в Slack", description: "изключено", kind: "notify", enabled: false },
  { name: "Pre-commit кука: lint", description: "всички проекти", kind: "hook", enabled: true },
  { name: "Снимка при промяна в UI", description: "playwright", kind: "hook", enabled: true },
  { name: "Нощен доклад по имейл", description: "07:00", kind: "notify", enabled: true },
];
const subjects = ["Claude Code", "Codex", "Gemini CLI", "Нощна смяна"];
const tools = ["github", "playwright", "postgres", "stripe", "web-search", "bash: мрежа"];
const grid: PermissionCell["decision"][][] = [["allow", "allow", "ask", "ask", "allow", "deny"], ["allow", "deny", "allow", "deny", "allow", "deny"], ["allow", "deny", "ask", "deny", "allow", "deny"], ["allow", "allow", "deny", "deny", "allow", "deny"]];
const permissions: PermissionCell[] = subjects.flatMap((s, i) => tools.map((t, j) => ({ subject: s, tool: t, decision: grid[i]?.[j] ?? "deny" })));
const calls: ToolCallRow[] = [
  { at: ago(0), session_id: "s_shop_cc3", agent: "claude #3", kind: "mcp", tool: "playwright.screenshot", summary: "localhost:5173/signup", decision: "allowed", duration_ms: 420 },
  { at: ago(0.5), session_id: "s_api_cx1", agent: "codex #1", kind: "mcp", tool: "postgres.query", summary: "select … from api_keys", decision: "allowed", duration_ms: 6 },
  { at: ago(1), session_id: "s_api_cc4", agent: "claude #4", kind: "mcp", tool: "github.get_issue", summary: "#412", decision: "allowed", duration_ms: 14 },
  { at: ago(1.5), session_id: "s_ml_gm1", agent: "gemini #1", kind: "mcp", tool: "s3.get_object", summary: "embeddings/v3.parquet", decision: "slow", duration_ms: 1400 },
  { at: ago(2), session_id: "s_shop_cc1", agent: "claude #1", kind: "mcp", tool: "stripe.create_refund", summary: "тестов ключ", decision: "asked", duration_ms: null },
  { at: ago(3), session_id: "s_shop_cx2", agent: "codex #2", kind: "bash", tool: "curl", summary: "https://api.segment.io", decision: "denied", duration_ms: null },
  { at: ago(4), session_id: "s_api_cc4", agent: "claude #6", kind: "mcp", tool: "web-search.search", summary: "upstream timeout best practice", decision: "allowed", duration_ms: 310 },
];
const windows: WindowRow[] = [
  { id: "w1", kind: "terminal", title: "shop · claude #3", url: null, status: "live", repo: "shop", last_seen_at: ago(0) },
  { id: "w2", kind: "terminal", title: "api-gateway · codex", url: null, status: "live", repo: "api-gateway", last_seen_at: ago(0) },
  { id: "w3", kind: "terminal", title: "infra · ти", url: null, status: "idle", repo: "infra", last_seen_at: ago(12) },
  { id: "w4", kind: "preview", title: "shop · дърво B", url: "http://localhost:5173/", status: "live", repo: "shop", last_seen_at: ago(0) },
  { id: "w5", kind: "preview", title: "design-system · Storybook", url: "http://localhost:6006/", status: "live", repo: "design-system", last_seen_at: ago(1) },
  { id: "w6", kind: "server", title: "billing · api", url: "http://localhost:8080/", status: "live", repo: "billing", last_seen_at: ago(0) },
  { id: "w7", kind: "server", title: "ml-pipeline · notebook", url: "http://localhost:8888/", status: "slow", repo: "ml-pipeline", last_seen_at: ago(2) },
  { id: "w8", kind: "log", title: "вратата · всички", url: null, status: "live", repo: null, last_seen_at: ago(0) },
];
const night: NightView = {
  shift: { id: "n1", starts_at: at(23), ends_at: at(7), budget_usd: 18, spent_usd: 0, status: "planned", rules: { auto_merge: { min_level: 3, max_lines: 80 }, on_fail: "retry_then_park", retries: 1, same_file: "wait", forbid_tools: ["stripe.*", "postgres.write"] } },
  queue: [
    { position: 0, repo: "shop", text: "Обнови README с новите команди", risk: "low", est_minutes: 40, est_usd: 0.3, status: "queued" },
    { position: 1, repo: "shop", text: "E2E тест за checkout", risk: "low", est_minutes: 90, est_usd: 1.8, status: "queued" },
    { position: 2, repo: "api-gateway", text: "Логове в JSON формат", risk: "low", est_minutes: 72, est_usd: 1.1, status: "queued" },
    { position: 3, repo: "billing", text: "Миграция на сумите в стотинки", risk: "high", est_minutes: 150, est_usd: 3.4, status: "queued" },
    { position: 4, repo: "design-system", text: "Токени за тъмна тема", risk: "low", est_minutes: 96, est_usd: 1.2, status: "queued" },
    { position: 5, repo: "ml-pipeline", text: "Кеш на ембедингите (втори опит)", risk: "medium", est_minutes: 180, est_usd: 2.9, status: "queued" },
  ],
  last: { starts_at: ago(19 * 60), spent_usd: 14.1, budget_usd: 18, merged: 9, waiting: 2, failed: 1, items: [
    { text: "Health endpoint с версията", repo: "api-gateway", status: "merged" }, { text: "Закръгляне на сумите", repo: "billing", status: "merged" },
    { text: "Пагинация · 1 мутант оцеля", repo: "mobile-api", status: "waiting" }, { text: "Кеш на ембедингите", repo: "ml-pipeline", status: "failed" },
  ] },
};
const research: ResearchView = {
  questions: [
    { id: "q_limits", question: "Какви са лимитите на абонаментите и API за паралелни агенти през нощта?", status: "running", created_at: ago(55), claims: 6 },
    { id: "q_sandbox", question: "Как другите харнеси изолират мрежата на агента?", status: "done", created_at: ago(26 * 60), claims: 11 },
  ],
  current: {
    id: "q_limits", question: "Какви са лимитите на абонаментите и API за паралелни агенти през нощта?", status: "running",
    draft: "[ПРИМЕР] Абонаментите имат прозорец на използване, а не таван на брой агенти; при много паралелни сесии прозорецът свършва по-бързо [1][3].",
    sources: [
      { n: 1, title: "docs · Usage limits", url: "https://example.com/limits", state: "read" }, { n: 2, title: "docs · Rate limits", url: "https://example.com/rate", state: "read" },
      { n: 3, title: "help · Plans", url: "https://example.com/plans", state: "read" }, { n: 4, title: "форум · „нощем е по-бързо“", url: "https://example.com/forum", state: "weak" },
      { n: 9, title: "блог · паралелни агенти", url: "https://example.com/blog", state: "read" }, { n: 12, title: "pdf · условия", url: "https://example.com/terms.pdf", state: "failed" },
    ],
    claims: [
      { text: "[ПРИМЕР] Лимитът на абонамента е за прозорец от време, не за брой паралелни сесии.", verdict: "confirmed", source_ns: [1, 3] },
      { text: "[ПРИМЕР] API ключът има лимит на заявки в минута по ниво на акаунта.", verdict: "confirmed", source_ns: [2, 9] },
      { text: "[ПРИМЕР] Нощем лимитите са по-високи.", verdict: "conflict", source_ns: [4, 2] },
      { text: "[ПРИМЕР] Паралелните агенти в един акаунт споделят един лимит.", verdict: "single", source_ns: [9] },
      { text: "[ПРИМЕР] Таймаутът на дълги сесии е 5 часа.", verdict: "unchecked", source_ns: [] },
    ],
  },
};
const home: HomeExtras = { mcpPerMin: 212, denied24h: 3, costToday: 23.4, conflicts: [{ repo: "shop", path: "src/cart.ts", sessions: 2 }], windows };

export const SAMPLE = { fleet, mcp, skills, plugins, permissions, calls, windows, night, research, home };

/** The inside of one session (design H4) for a task that has no recorded sessions yet. */
export function sessionSample(taskId: string): { sessions: (FleetRow & { depth: number })[]; calls: ToolCallRow[]; windows: WindowRow[] } {
  const s = (id: string, parent: string | null, agent: string, step: string, state: FleetRow["state"], depth: number) => ({ ...f(id, parent, "shop", agent, "sonnet", "work", parent ? "subagent" : "lead", state, step, parent ? 15 : 62, parent ? 0.04 : 0.31, [], 6), task_id: taskId, depth });
  return {
    sessions: [s("s_x", null, "водещ агент", "пише код", "running", 0), s("s_x_t", "s_x", "тестове", "пише тестове", "running", 1), s("s_x_r", "s_x", "ревю", "чете разликата", "running", 1), s("s_x_s", "s_x", "ресърч", "готов", "done", 1)],
    calls: [
      { at: ago(6), session_id: "s_x", agent: "водещ агент", kind: "skill", tool: "test-first", summary: "червен тест първо", decision: "allowed", duration_ms: null },
      { at: ago(5), session_id: "s_x", agent: "водещ агент", kind: "mcp", tool: "github.get_issue", summary: "#407 „+ адреси се отхвърлят“", decision: "allowed", duration_ms: 14 },
      { at: ago(4), session_id: "s_x_t", agent: "тестове", kind: "builtin", tool: "Edit", summary: "tests/signup.spec.ts +18", decision: "allowed", duration_ms: null },
      { at: ago(3), session_id: "s_x", agent: "водещ агент", kind: "builtin", tool: "Edit", summary: "src/signup.ts +6 −1", decision: "allowed", duration_ms: null },
      { at: ago(2), session_id: "s_x", agent: "водещ агент", kind: "bash", tool: "npx vitest run", summary: "1 падна: accepts plus addressing", decision: "error", duration_ms: 3100 },
      { at: ago(1), session_id: "s_x", agent: "водещ агент", kind: "mcp", tool: "playwright.screenshot", summary: "localhost:5173/signup", decision: "allowed", duration_ms: 420 },
      { at: ago(0), session_id: "s_x", agent: "Мандат", kind: "mandat", tool: "export", summary: "2 файла, дървото съвпада → тестове преди и след", decision: "allowed", duration_ms: null },
    ],
    windows: windows.filter((w) => w.repo === "shop"),
  };
}
