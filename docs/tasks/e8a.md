# E8а — контролен слой и компилатор на профила (v5 т. 4.1)
Тестови файлове:
- [x] packages/profile/src/compile.test.ts (таблица правило × цел; Claude; Codex; Gemini/local; snapshot-и)
- [x] packages/agents/src/hooks.test.ts, hooks-more.test.ts (всичките 6 куки)
- [x] apps/worker/src/run.test.ts › runTask with a harness profile (сийд преди агента; argv/env; harness.json)
- [x] apps/worker/src/sh2.docker.test.ts (контролният слой е само за четене; A/B)
- [x] apps/worker/src/control-layer.docker.test.ts (deny-live с fake:sh2-probe; codex куки + подправен CODEX_HOME → UNKNOWN)
Готово, когато:
- [x] AC-2.2 (контролен слой ro), AC-2.3 (куките на харнеса), AC-2.4 (компилатор по цел), AC-2.7 (агентът не може да отслаби правилата: config_change → UNKNOWN; репо файловете → D3/D4)
- [ ] live: истинска задача с Claude Code, в която `git push` е отказан — чака Симо (чеклист стъпка 5)
