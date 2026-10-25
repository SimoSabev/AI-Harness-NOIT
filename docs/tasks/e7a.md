# E7а — живи спайкове и общи договори (v5 т. 3.1, т. 2)
Тестови файлове:
- [x] packages/contract/src/agent-stream.test.ts (StreamEvent, ctx, redaction, context_pct)
- [x] packages/contract/src/profile.test.ts (слоеве A–H, hash, Subject/ToolPattern, Materialized)
- [x] packages/contract/src/roles.test.ts (вградени роли, опасни, scope)
- [x] packages/contract/src/research-schemas.test.ts (източник, цитат, твърдение, 7 инструмента)
- [x] packages/contract/src/workbench.test.ts (нощ v5, нови видове доказателства/дневник/събития)
- [x] packages/agents/src/agent-stream.test.ts (claude/codex/fake toStream срещу фикстури; истинската S0 фикстура — SKIPPED D-276)
- [x] packages/agents/src/hooks.test.ts (deny-by-policy)
- [x] packages/agents/src/control-layer.test.ts (варианти A/B; абонамент без --bare, D-342)
- [x] apps/worker/src/sh2.docker.test.ts (fake вариант на SH2, A и B)
- [x] packages/sandbox/src/sub-volume-isolation.test.ts (S-SUB статично)

Готово, когато:
- [x] pnpm check зелено
- [x] test:docker зелено (виж docs/reports/E7a.md)
- [x] docs/spikes/{S0,S1,S2,S-CX,SH2,SH2-CX,S-SUB}.md с реален изход или „SKIPPED: липсва <env>“
- [x] fixtures/stream-json и fixtures/codex-jsonl: синтетични записи + истинските SKIPPED (чеклист стъпки 2, 6)
- [x] D-34x за контролния слой (D-343, временно до живия SH2)
- [ ] живите S0, S1, S2, S-CX, SH2 live, S-SUB — чакат Симо (docs/setup/local-live-checklist.md)
