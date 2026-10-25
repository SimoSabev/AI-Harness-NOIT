import type { ProfileLayersInput } from "./profile.js";

/** The demo-shop profile used by the contract and compiler tests (fixtures/demo-shop). */
export function demoProfileLayers(): ProfileLayersInput {
  return {
    a: {
      version: 2,
      runtime: { node: "24", package_manager: "npm", install: "npm ci --ignore-scripts" },
      tests: { framework: "vitest", command: "npx vitest run --reporter=json --outputFile=/m/out/report.json", env: {}, test_globs: ["tests/**/*.test.ts"] },
      ci: null,
      task_types: { bugfix: { allowed_paths: ["src/**", "tests/**"], may_change_tests: false, risk_class: "medium" }, docs: { allowed_paths: ["docs/**", "README.md"], may_change_tests: false, risk_class: "low" } },
      risk_classes: { low: { level_cap: 3, requires_second_factor: false }, medium: { level_cap: 2, requires_second_factor: false } },
      protected_paths: [".github/**", ".mandat.yml", "package-lock.json"],
      protected_json_fields: { "package.json": ["scripts", "dependencies", "devDependencies"] },
      config_paths: [".claude/**", ".mcp.json", ".codex/**", "AGENTS.md", "CLAUDE.md"],
      budgets: { task_usd: 2, task_minutes: 20 },
      models: { allowed: ["claude", "codex"], default: "claude" },
      harness: { required_detectors: ["D1", "D2", "D3", "D4", "D10"], max_level: 3 },
      security: { max_file_mb: 1, max_diff_mb: 5, max_files: 200 },
    },
    b: {
      summary: "A small shop: cart, discounts, checkout.",
      commands: { install: "npm ci --ignore-scripts", test: "npx vitest run", test_one: "npx vitest run {file}", lint: "npx eslint {files}", typecheck: "npx tsc --noEmit" },
      boundaries: ["Do not change tests for a bugfix.", "Prices are integer cents."],
      task_types: ["bugfix", "docs"],
      links: [],
      style: ["2 spaces", "double quotes"],
      conventions: ["commit title: <type>: <what>"],
    },
    c: [
      { subject: "any", tool: "bash:git push *", decision: "deny", reason: "the harness delivers, never the agent" },
      { subject: "any", tool: "bash:curl *", decision: "deny", reason: "no network outside the gate" },
      { subject: "any", tool: "path:write:infra/**", decision: "deny", reason: "infrastructure is high risk" },
      { subject: "any", tool: "net:registry.npmjs.org", decision: "allow", reason: "installs go through the gate" },
      { subject: "night", tool: "mcp:stripe.*", decision: "deny", reason: "no payments at night" },
      { subject: "agent:claude", tool: "mcp:github.create_issue", decision: "ask", reason: "a human decides on new issues" },
    ],
    d: [
      { event: "pre_tool", matcher: "Bash", script: "deny-by-policy", args: {} },
      { event: "post_tool", matcher: "Edit|Write|MultiEdit", script: "typecheck-changed", args: {} },
      { event: "stop", matcher: null, script: "require-tests-ran", args: {} },
    ],
    e: {
      mcp: [
        { name: "mandat", transport: "http", package: null, url: "http://egress-gate/mcp/mandat", version: "1", digest: null, tools_hash: null, enabled_tools: ["mandat_status", "mandat_verify"], egress_hosts: [], secrets: [] },
      ],
      skills: [{ name: "test-first", source: "builtin", content_hash: `sha256:${"1".repeat(64)}`, description: "Write the failing test first." }],
      plugins: [],
    },
    f: { roles: [{ role: "reviewer", model: "claude-haiku-5-5", tools: ["path:read:**"], max_turns: 20, description: "Reads the diff and reports problems; never writes." }] },
    g: { required_detectors: ["D1", "D2", "D3", "D4", "D10"], mutants: 3, max_diff_lines: 400, ui_paths: [], definition_of_done: { bugfix: ["a test that failed before passes"] }, max_subagents: 2, max_depth: 1 },
    h: { budgets: { task_usd: 2, task_minutes: 20 }, routing: [{ task_type: null, role: "lead", mode: "auto", channel: null, fallback: [] }] },
  };
}
