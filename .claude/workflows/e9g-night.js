export const meta = {
  name: 'e9g-night',
  description: 'E9g night run: desktop app (bridge, native, local access, keys/terminal, packaging) + download/docs site, then skeptic review and report',
  whenToUse: 'Overnight implementation of docs/tasks/e9g.md on branch phase/e9g-desktop-pro in the AI-Harness-NOIT repo',
  phases: [
    { title: 'Desktop', detail: 'steps 1-5 of docs/tasks/e9g.md' },
    { title: 'Site', detail: 'steps 6-7: download page, docs, visuals' },
    { title: 'Review', detail: 'skeptic over the whole branch diff, then fixes' },
    { title: 'Report', detail: 'docs/reports/E9g.md, progress, live checklist' },
  ],
}

// Self-contained: every step gets the whole context below, so it can be started from any profile on this checkout.
const CONTEXT = `
You are one step of an unattended NIGHT run in the repo AI-Harness-NOIT (the harness "Mandat": task -> AI agent in a Docker
sandbox -> safe export -> verdict D1-D12 -> ledger). Nobody is awake: NEVER ask the user anything and never wait for an answer.

THE GOAL OF THE NIGHT (owner Simo, 23.10.2026): two things.
 (A) A real desktop app with THE SAME DESIGN AS NOW: the same Next.js UI from apps/web (same tokens in
     apps/web/src/app/globals.css: dark default near-black + muted lime accent #a6c25e, identical light theme; fonts Tektur /
     Geologica / Martian Mono self-hosted) inside Electron (apps/desktop, today a tray wrapper around \`pnpm local\`, D-303),
     plus a native layer, LOCAL PERMISSIONS (per-folder grants: read / apply / open_editor / terminal) and LOCAL EDITS
     ("Apply locally" = \`mandat apply --task <id>\`, merge --ff-only, never reset/checkout -f; "Open in editor").
 (B) A small website (apps/site) to DOWNLOAD the app for macOS ("ios" in the request means macOS: dmg), Windows and Linux,
     with DOCS that have visuals (SVG diagrams + real UI screenshots) and explanations, bg/en, same design.
The full plan with checkboxes is docs/tasks/e9g.md. READ IT FIRST, then the parts you need of: docs/prd/PRD.md section 6.12
(AC-12.1..12.10), docs/spec/Харнес_v5_имплементация_промпт_кодер.md section 5.7, docs/decisions.md D-303, D-327, D-368..D-370,
apps/desktop/src/*.ts, HANDOFF.md section 5 (traps).

HARD RULES FOR TONIGHT (AGENTS.md applies in full; these are the ones that bite):
- Branch: phase/e9g-desktop-pro. Check \`git rev-parse --abbrev-ref HEAD\` before anything. Never push, never touch remotes,
  never create releases/tags, never deploy the site, never sign anything (rule 3). Never read/print/load .env (rule 4).
- Tests first (rule 1): red test -> code -> green. Before EVERY commit run \`pnpm check\` and confirm the output contains
  "CHECK OK" (do not trust \`| tail\`). apps/desktop is OUTSIDE the pnpm workspace (own lockfile): build/test it with
  \`pnpm --dir apps/desktop ...\`; make sure its tests are run by something (add to its package.json scripts and mention how).
- Small commits, one logical move each, message \`<package>: <what>\` in English, ending with the line
  "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>".
- New dependency (rule 8): exact version, published >= 3 days ago (check \`npm view <pkg>@<ver> time\`), license in
  license-allowlist.json, a row in docs/dependencies.md. Every CLI flag / external-tool fact: link + date in docs/decisions.md,
  otherwise mark [НП] (rule 9). New decisions continue the numbering after the last "## D-" heading in docs/decisions.md,
  written in Bulgarian like the existing ones, each with "Защо:".
- Interfaces only in packages/contract (zod, rule 11). Style: ESM, named exports only, kebab-case files, MandatError with code,
  no \`any\`, zod at every boundary. packages/core must not import sandbox/egress-gate/llm-proxy/agents/export/child_process.
- Window security stays (D-303): contextIsolation true, nodeIntegration false, sandbox true, navigation only to the local
  address, new windows denied; add a CSP. The preload exposes ONLY the listed, zod-validated methods. The agent in the sandbox
  never gets anything from the desktop layer (no new mounts, no env, no keys; rule 2/7).
- UI strings: English is the source, Bulgarian the translation; web strings in apps/web/src/i18n, desktop strings in
  apps/desktop/src/i18n.ts; 0 strings outside the catalog (there is a static test).
- When something is unclear: pick the safe default, add a "## Q-0xx" entry to docs/questions-for-simo.md (same format as
  the existing ones: Контекст / Въпрос / Избрах по подразбиране / Ако избереш друго / Блокира ли / Статус: отворен), continue.
- Known traps: stale dist from turbo cache -> \`npx turbo run build --force\`; vitest with relative paths only from the repo root
  (\`npx vitest run <file>\`); Docker may be off tonight -> Docker tests are optional, unit + e2e under Playwright are not.
- Do not redo or rewrite work of earlier steps; build on it. If \`git status\` shows leftovers of a crashed earlier step, read
  them: finish and commit them if they are sound, else \`git stash push -m e9g-leftover\` and say so in your summary.
- Stay inside your step's scope. If time or a blocker stops you, commit what is green, tick what is done in docs/tasks/e9g.md,
  and return status "partial" or "blocked" with the reason. Never leave the tree red or uncommitted.
`

const STEP = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    commits: { type: 'array', items: { type: 'string' }, description: 'short sha + subject of each commit you made' },
    check_ok: { type: 'boolean', description: 'pnpm check printed CHECK OK at your last commit' },
    summary: { type: 'string', description: 'what now exists, file paths, how to try it (<= 15 lines)' },
    skipped: { type: 'array', items: { type: 'string' }, description: 'plan items not done and why' },
    questions: { type: 'array', items: { type: 'string' }, description: 'Q-0xx ids you added' },
    decisions: { type: 'array', items: { type: 'string' }, description: 'D-xxx ids you added' },
  },
  required: ['status', 'commits', 'check_ok', 'summary', 'skipped', 'questions', 'decisions'],
}

const STEPS = [
  {
    id: 1, phase: 'Desktop', deps: [], title: 'bridge + contract + CSP',
    task: `STEP 1 (plan section A1). First: if branch phase/e9g-desktop-pro does not exist, create it from the current HEAD
(\`git switch -c phase/e9g-desktop-pro\`), else switch to it. If docs/tasks/e9g.md or .claude/workflows/e9g-night.js are
uncommitted, commit them first ("docs: E9g plan for the desktop app and the download site").
Then: packages/contract/src/desktop.ts with zod schemas for every message between the Electron main process and the web UI
(menu commands, pickFolder, grants list/grant/revoke with LocalGrant {path, scopes: read|apply|open_editor|terminal, granted_at},
openInEditor, applyLocal, notify, badge, inbox count) + tests; apps/desktop/src/preload.ts exposing window.harnessDesktop via
contextBridge with only those methods, validating both ways; main.ts loads the preload; apps/web/src/lib/client/desktop.ts that
detects the bridge (without it the web behaves exactly as today - test it). CSP for the desktop window; tests that unknown IPC
channels, new windows and outside navigation are refused. Record the bridge design as a decision.`,
  },
  {
    id: 2, phase: 'Desktop', deps: [1], title: 'menus, shortcuts, tray, notifications',
    task: `STEP 2 (plan section A2, AC-12.5, AC-12.7). Native menus: File (New task, Add project, Apply locally), Edit,
View (Inbox/Board/Agents/Tools/Night/Research - use the real routes under apps/web/src/app), Window, Help, and a "Keys" menu
listing every shortcut. Shortcuts: Cmd/Ctrl+N new task, Cmd/Ctrl+Enter approve (through the web's existing TOTP dialog, never
bypassing it), Cmd/Ctrl+K search, Cmd/Ctrl+1..9 projects; global quick entry Cmd/Ctrl+Shift+Space. The shortcut map is a pure
function with a unit test. Tray/menubar with a "waiting for you" counter read from the existing inbox API
(apps/web/src/app/api/inbox), dock/taskbar badge, system notifications whose click opens the task card. Closed window keeps the
harness running (exists); "Start at login" option, OFF by default. All new strings in apps/desktop/src/i18n.ts (en + bg).`,
  },
  {
    id: 3, phase: 'Desktop', deps: [1], title: 'local access: permissions and edits',
    task: `STEP 3 (plan section A3, AC-12.6). The desktop sees nothing on disk until the person grants a folder. Grants
(LocalGrant from step 1) live only in the main process, in a file in the harness profile directory (look at packages/profile
for where the profile lives), written atomically, mode 0600. Granting: native folder dialog, drag-and-drop of a folder on the
window, and "Open with" -> the web "Add project" screen with a suggestion -> a native confirmation that lists the scopes.
Checks (pure functions, tested hard): realpath (no symlink escape), refuse "/", the whole home directory and system folders,
every path used must be inside a granted folder with the needed scope. Scopes: read = may become a project; apply = "Apply
locally" button runs \`mandat apply --task <id>\` (packages/cli apply, merge --ff-only); open_editor = open a diff file in
vscode:// / cursor:// / zed:// (choice in Settings); terminal = reserved for step 4. Every use is written to task_activities
through the existing web API, not to the ledger. Settings -> "Local access" page in the web: list, revoke scope/folder (shown
only when the bridge exists). Add a test that granting changes nothing in the sandbox's mounts/env.`,
  },
  {
    id: 4, phase: 'Desktop', deps: [1], title: 'keychain KEK + embedded terminal',
    task: `STEP 4 (plan section A4, AC-12.9, AC-12.8). (a) KEK of the key envelope (see D-3xx about the envelope / E7c,
docs/reports/E7c.md) stored with Electron safeStorage: check the Electron 44 docs first, put link + date in a decision, remove
the [НП]; test with a fake keychain; keys survive a restart. (b) STRETCH: embedded terminal with xterm.js + node-pty on the
host worktree of a project, only with the "terminal" scope, clearly labelled "not the sandbox", commands logged to
task_activities. node-pty is a native build: if it does not install/build cleanly on this machine within reason, do NOT force
it - add [НП] + a Q entry, mark AC-12.8 deferred, return "partial". (a) must be done either way.`,
  },
  {
    id: 5, phase: 'Desktop', deps: [1], title: 'self-contained package for 3 OS',
    task: `STEP 5 (plan section A5, AC-12.1 without signing). Today main.ts spawns \`pnpm local\` from the repo. The installed app
must be self-contained: put the built harness (cli dist + web build, e.g. Next standalone output - make sure \`pnpm local\`
still works) into the app resources and run it with Electron's Node (ELECTRON_RUN_AS_NODE) instead of pnpm; dev mode
(\`pnpm desktop\`) keeps working from the repo. Docker stays required (show the existing check). electron-builder (rule 8!)
config: dmg arm64+x64, nsis x64, AppImage+deb x64, artifact names Harness-<version>-<os>-<arch>.<ext>, unsigned.
electron-updater wired but OFF unless a feed is configured (default feed would be GitHub Releases of SimoSabev/AI-Harness-NOIT,
Q-054). Build the dmg on this machine and start it once to see the inbox (if building is impossible, say exactly why).
.github/workflows/desktop-build.yml that builds the 3 OS and uploads WORKFLOW ARTIFACTS only (no release, no publish).
docs/setup/signing.md: notarization with Apple ID and Windows Authenticode, step by step for Simo. Playwright Electron e2e:
start -> inbox, menu -> new task, drag-and-drop -> "Add project", action refused without a grant.`,
  },
  {
    id: 6, phase: 'Site', deps: [], title: 'site skeleton + download page',
    task: `STEP 6 (plan section B, first half). New apps/site: static Next.js (output: "export", NO new dependencies - reuse the
versions apps/web already uses). Same design: move the color tokens out of apps/web/src/app/globals.css into one file
(e.g. apps/web/src/app/tokens.css) that both apps import, so there is still exactly one token file (AC-12.4 test stays green);
fonts copied from apps/web/public/fonts at build, no Google/external requests. Pages: "/" (what the harness is in 3 sentences,
a flow diagram placeholder, "Download for <your OS>" button with client-side OS detection), "/download" (macOS Apple Silicon /
Intel dmg, Windows exe, Linux AppImage/deb, SHA-256 next to each from apps/site/releases.json generated by
scripts/release-manifest.mjs from the electron-builder output folder; requirements Docker >= 25.0.5 and disk; phone -> PWA
instructions; links go to https://github.com/SimoSabev/AI-Harness-NOIT/releases/latest/download/<asset>; with no release
in the manifest show "coming soon", never a broken link). bg/en with the same catalog style. No analytics, no cookies
(PRD-15). Tests: export builds, internal links resolve, no external requests. Wire it into turbo/pnpm check.`,
  },
  {
    id: 7, phase: 'Site', deps: [6], title: 'docs with visuals',
    task: `STEP 7 (plan section B, second half). /docs in apps/site, bg/en: Getting started, How it works, Verdicts
(VERIFIED / UNKNOWN / FAILED and detectors D1-D12 with one real example each - take the wording from
packages/contract explain texts and docs/glossary.md, do not invent behavior), Desktop app and local access (the scope table
from docs/tasks/e9g.md, what the app can and cannot touch), Night shift, Security (sandbox, proxy holds the key, nothing sent
to us), Subscription and keys, FAQ. Visuals: hand-made inline SVG diagrams using the tokens (work in both themes) - at least
the main flow task -> sandbox -> export -> verdict -> ledger, the permission model, and the night shift loop; plus REAL UI
screenshots made by a script (scripts/site-shots.mjs, Playwright, already a dependency of apps/web) against \`pnpm local\`
with the sample data (apps/web/src/lib/sample.ts), dark and light, saved in apps/site/public/shots; if the local stack cannot
start tonight, commit the script and leave clearly marked placeholders instead of fake images. Alt text everywhere; axe
0 serious/critical on every docs page. docs/setup/site.md: how Simo deploys apps/site/out (GitHub Pages or Vercel).`,
  },
]

const results = {}
const brief = (id) => {
  const r = results[id]
  return r ? `step ${id} [${r.status}]: ${r.summary}${r.skipped && r.skipped.length ? ` | skipped: ${r.skipped.join('; ')}` : ''}` : ''
}

for (const s of STEPS) {
  const blocked = s.deps.filter((d) => !results[d] || results[d].status === 'blocked')
  if (blocked.length) {
    results[s.id] = { status: 'blocked', commits: [], check_ok: false, summary: `not started: depends on blocked step(s) ${blocked.join(', ')}`, skipped: [s.title], questions: [], decisions: [] }
    log(`step ${s.id} skipped (blocked by ${blocked.join(', ')})`)
    continue
  }
  phase(s.phase)
  const before = Object.keys(results).map((k) => brief(k)).filter(Boolean).join('\n')
  const r = await agent(
    `${CONTEXT}\n\nEARLIER STEPS TONIGHT:\n${before || '(none - you are first)'}\n\n${s.task}\n\nWhen done, tick your items in docs/tasks/e9g.md (in a commit) and return the structured result.`,
    { label: `step ${s.id}: ${s.title}`, phase: s.phase, schema: STEP },
  )
  results[s.id] = r || { status: 'blocked', commits: [], check_ok: false, summary: 'the agent stopped without a result', skipped: [s.title], questions: [], decisions: [] }
  log(`step ${s.id} ${results[s.id].status}: ${s.title}`)
}

phase('Review')
const all = Object.keys(results).map((k) => brief(k)).join('\n')
const review = await agent(
  `${CONTEXT}\n\nTONIGHT'S STEPS:\n${all}\n\nSTEP 8 - SKEPTIC REVIEW. Read the whole diff of the branch against its base
(\`git log --oneline\` to find where phase/e9g-desktop-pro left feat/chat-workspace, then \`git diff <base>..HEAD\`). Try to break it:
(1) the bridge: any way for the page to call something not in the zod list, reach Node, open outside URLs, or skip the TOTP on
approve; (2) local access: symlink/.. escapes, paths outside grants, home/root grants, grant file permissions, anything leaking
into the sandbox; (3) AGENTS.md rules 1-11 (tests exist for new code, deps per rule 8, facts with links per rule 9, no secrets
logged, no push/publish); (4) the site sends no external requests and no broken download links; (5) the design really is the
same token file. Fix every real problem you find test-first in small commits, \`pnpm check\` -> CHECK OK. List what you
fixed and what you only report.`,
  { label: 'step 8: skeptic review + fixes', phase: 'Review', schema: STEP, effort: 'high' },
)
results[8] = review || { status: 'blocked', commits: [], check_ok: false, summary: 'review did not return', skipped: ['review'], questions: [], decisions: [] }

phase('Report')
const report = await agent(
  `${CONTEXT}\n\nTONIGHT:\n${Object.keys(results).map((k) => brief(k)).join('\n')}\n\nSTEP 9 - REPORT. Write docs/reports/E9g.md in Bulgarian in
the style of docs/reports/E9b.md: what was built per step, AC-12.1/12.5-12.9 and the site with pass / deferred / waiting-for-Simo,
test counts, every D-/Q- id added tonight, what was skipped and why, exactly how to try it in the morning (\`pnpm desktop\`, the
dmg path, how to open the site). Update docs/progress.md (row 24 status and the "Текуща задача" section), and append to
docs/setup/local-live-checklist.md the steps only Simo can do (signing, Windows/Linux installers from CI, site deploy, a live
run of the desktop). Final \`pnpm check\` -> CHECK OK, commit "docs: E9g night report". Do not push.`,
  { label: 'step 9: report', phase: 'Report', schema: STEP },
)
results[9] = report || { status: 'blocked', commits: [], check_ok: false, summary: 'report did not return', skipped: ['report'], questions: [], decisions: [] }

return results
