# E1в — врата GitHub и външна присъда (docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md т. 6)

## Код и тестове
- [x] packages/gate-github (Apache): порт (PullInfo, RulesInfo, GitHubPort, CheckName), fakeGitHub с наложен ruleset
- [x] renderCheck + checkLine — check-render.test.ts
- [x] core: decideDelivery, afterVerify2, D7.ci lite — gate-level.test.ts
- [x] deliver / humanApproved / autoMerge — gate-level2-approval.test.ts, merge-sha.test.ts, cas-ref.test.ts
- [x] external PR: произход (origin), прием (intake), опашка, head от refs/pull/<n>/head — origin-spoof.test.ts, external-intake.test.ts
- [x] external PR поток (fakeGitHub + пясъчник) — external-pr.docker.test.ts
- [x] стълбата за външни: отделен ключ, таван 1 — external-ladder-key.test.ts
- [x] outbox → GitHub ефекти идемпотентно по external_id — outbox-github.test.ts
- [x] webhook приемник (node:http, подпис, дедупликация по X-GitHub-Delivery) — webhook.test.ts
- [x] octokitGitHub (@octokit/app, @octokit/rest, @octokit/webhooks)
- [x] `mandat demo external-pr --fake`
- [x] live L1–L3 (*.live.test.ts; SKIPPED без GITHUB_*)
- [x] docs/setup/github-apps.md, github-demo-repo.md, live-tests.md

## Готово, когато
- [x] pnpm check → зелено
- [x] pnpm test:docker --project gate → зелено
- [x] node scripts/check-test-counts.mjs → списък
- [x] pnpm mandat demo external-pr --fake → "Мандат verdict: failure — FAILED · D7.ci pass · D2.inventory fail (20 → 19)"
- [x] live L1–L3: SKIPPED (3, D-276) с „липсва GITHUB_WRITER_APP_ID“ (не се броят за минали)
