# E8б — харнес-профил A–H (v5 т. 4.2)
- [x] packages/onboard/src/propose-layers.test.ts (6 fixtures → 8 слоя, детерминизъм, snapshot)
- [x] packages/onboard/src/visible-layer-no-secrets.test.ts
- [x] supabase/tests/harness_profiles.test.sql (TOTP, невидими знаци, една транзакция, rollback, неизменност)
- [x] apps/web/src/lib/server/profile-approve.test.ts
- [x] apps/worker/src/online/daemon.test.ts › harness profiles (AC-2.5/2.6)
- [x] apps/worker/src/online/baseline.test.ts › scan → proposed profile
- [x] apps/web/e2e/harness.spec.ts (сканирай → слоеве → преглед → одобри)
- [x] packages/cli/src/init.test.ts › init --profile
Готово, когато:
- [x] AC-2.1, AC-2.5, AC-2.6
- [x] `pnpm mandat init --repo fixtures/demo-shop --profile` пише .mandat/profile.proposed.json с 8 слоя
- [ ] „Пробвай“ с fake:honest-fix върху неодобрен профил (UI бутон) — отложено (D-351)
