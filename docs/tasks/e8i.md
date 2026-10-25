# E8и — monorepo/workspaces, yarn berry, bun, node --test (v5 т. 4.9)
- [x] packages/contract/src/lockfiles.test.ts (pnpm workspaces, pnpm 12 два документа, berry, bun) — червен → зелен
- [x] packages/contract/src/policy.test.ts (node --test → node-test; bun)
- [x] packages/core/src/d10.test.ts (lock_missing по package.json на пакет)
- [x] packages/onboard/src/workspaces.test.ts, scan.test.ts (пакети, глобове и пътища по пакет, berry, bun, node --test)
- [x] packages/verify/src/node-test-reporter.test.ts (истински `node --test` с репортера)
- [x] packages/verify/src/runners.docker.test.ts: monorepo-pnpm, shop-yarn-berry, shop-bun-vitest, shop-node-test
- [x] docs/spikes/RUNNERS.md (berry, bun, node --test; mocha — Q-058)
Готово, когато:
- [x] fixtures/monorepo-pnpm (3 пакета) → честна поправка в пакет A → VERIFIED; изтрит тест в пакет B → FAILED
- [ ] yarn berry fixture → VERIFIED (docker)
