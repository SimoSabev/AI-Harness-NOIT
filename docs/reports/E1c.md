# Доклад E1в — 20.10.2026

## Статус: ГОТОВО (live чака Симо)

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| `pnpm check` | build, lint, typecheck, unit 321/321, test:counts, licenses (core 48, harness 299), no-dotenv — exit 0; gate-github lines 95.7% | ✓ |
| `pnpm test:docker --project gate` | `✓ external PR (docker) › изтрит тест M + зелен CI → failure; D7.ci pass и D2:missing_test:<M>; ниво ≤ 1; без merge/ready` · `Tests 1 passed (1)` | ✓ |
| `node scripts/check-test-counts.mjs` | `unit: 321 passed` · `docker: 1 passed` · `live: 0 passed, 0 failed, 4 skipped` · 4 × НЕПОКРИТИ (D-276) · `skipped: 4 (изброени)` | ✓ |
| `pnpm mandat demo external-pr --fake` | `Мандат verdict: failure — FAILED · D7.ci pass · D2.inventory fail (20 → 19)` · `FAILED: D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50` · `ниво: 1` | ✓ |
| live L1–L3 | SKIPPED (липсва GITHUB_WRITER_APP_ID …) — не се броят за минали | SKIPPED |

## Тестове
unit 321 (нови: gate-level 4, check-render 4, deliver: gate-level2-approval 3 + merge-sha 2 + cas-ref 1, intake: origin-spoof 1 +
external-intake 2, external (без Docker) 4, outbox-github 1, effects 1, octokit 1, external-ladder-key 1, webhook 2) · docker 1
(external-pr) · live 3 SKIPPED (L1–L3) + 1 (TSA). НЕПОКРИТИ: 4 live (D-276).

## Какво е направено
- packages/gate-github (Apache-2.0): GitHubPort, fakeGitHub (налага ruleset-а: 405 без зелени required checks от Writer App,
  409 при разминат sha, 422 при съществуващ ref), renderCheck (VERIFIED/FAILED/UNKNOWN → success/failure/action_required, без
  neutral, ≤ 65535, codeSpan за ID-та, без текст от PR), deliver/humanApproved/autoMerge (нива 0–3, CAS с нов ref за всеки
  опит, sha = head_sha, 409 → MIXED, 405 → HELD merge_blocked), origin/intake (S11–S14), externalPrVerdict (доверен base →
  refs/pull/<n>/head → предшественик → политика от base → износ на E0 → verifyChange external + D7.ci lite → check run),
  octokitGitHub (REST/GraphQL; тестван със скриптиран клиент), outbox handlers.
- core: decideDelivery, afterVerify2, d7ci (собствените check-ове се изключват по app_id), ladderStepFor (таван 1 за external,
  без стълба за MCP); D2 при fail носи before/after.
- worker: webhook приемник (node:http, подпис с @octokit/webhooks, дедупликация по X-GitHub-Delivery, 401 + security event).
- cli: `mandat demo external-pr --fake`. docs/setup: github-apps, github-demo-repo, live-tests.

## Решения
D-277 решено · D-278 решено · D-279 отворено (Q-023) · D-280 отворено.

## Отклонения от промпта
- Свързването в daemon-а (polling/webhook → опашка → присъда → outbox; VERDICT → GATED → deliver) е в E3а (D-280, D-275).
- createCommit в Octokit адаптера иска materialize() (файловете от диффа) — дава го worker-ът от огледалото.

## Сигурност
И2: Мандат никога не слива/маркира ready външен PR (тест: няма merge/ready/createPull/createRef). Head само от refs/pull/<n>/head на
base репото (S14). Произход само по Writer App + известен head (S11); mandat/* от друг → branch_namespace_spoof. UNKNOWN никога не е
зелен check (D-209). T3-5: заглавие/тяло на PR не влизат в summary (тест). Webhook: подписът е задължителен. Ключове: адаптерът ги
получава само от env на worker-а; кодерът не ги зарежда.

## Чака Симо
GitHub App-ове и демо хранилище (docs/setup/github-apps.md, github-demo-repo.md); live L1–L3 (docs/setup/live-tests.md).

## Часове и разход
план 25–34 ч / реално ≈ 3 ч · API $0

## Комити
`git log --oneline phase/e1b-core-online..phase/e1c-github-gate`

## Следващо
E2: packages/mcp (serveStdio, mandat_verify/status/explain, verifyd с job store), клон phase/e2-mcp.
