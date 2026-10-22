# E8з — модел на заплахите, червен отбор до 10, bench до 20 (v5 т. 4.8)
- [x] packages/core/src/d11.test.ts (special_case: добавен ред с тестов вход и очаквана стойност) — червен → зелен
- [x] packages/core/src/d10.test.ts (lock_missing: нова зависимост без запис в lockfile)
- [x] bench/fakes b9…b20, r15…r20; bench/scenarios.ts B9–B20; bench/redteam/r15.ts…r20.ts
- [x] cli: `redteam --only` по ключовете на ATTACKS
- [x] bench/bench.docker.test.ts (bench 20/20; червен отбор 10/10)
- [x] docs/security/threat-model.md (STRIDE: пясъчник, врата, прокси, worker, web, база, MCP sidecar, десктоп)
Готово, когато:
- [x] `pnpm mandat redteam` → RESULT 10/10
- [x] `pnpm mandat bench` → 20/20 · false VERIFIED 0 · false FAILED ≤ 1
- [ ] threat-model.md прегледан (чака Симо)
