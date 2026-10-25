# E8ж — доставка: шаблони, кръгове на CI, локално прилагане (v5 т. 4.7)
- [x] packages/gate-github/src/templates.test.ts (съобщение на комита, тяло на PR без суров външен текст) — „commit-template“, „pr-body“
- [x] apps/worker/src/online/ci.test.ts (червен CI → HELD ci_failed с лог; „Поправи CI“; таван 2) — „ci-rounds“
- [x] apps/web/src/lib/server/fix-ci.test.ts, apply-comments.test.ts
- [x] apps/worker/src/online/deliver-local.test.ts (клон в огледалото; съществуващ → отказ)
- [x] packages/cli/src/apply-local.test.ts (ff-only минава; локална промяна → отказ без промяна на status; разминаване → отказ) — „apply-local“
Готово, когато:
- [x] AC-9.1 (fakeGitHub: шаблонен PR, squash комит с трейлъри, check run; live L1–L3 чака Симо)
- [x] AC-9.2
- [x] AC-9.3
