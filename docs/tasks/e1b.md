# E1б — ядро онлайн (docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md т. 5, 3.2–3.4, 9.1)

## Код и тестове
- [ ] fixtures/demo-shop (т. 9.1) + `mandat fixtures build --name demo-shop` + ci.yml тест (без pull_request_target/workflow_run)
- [ ] contract: разширенията от т. 3.2 (OrgId, agent, phase, source, DetectorId, attempt, mode, LedgerKind)
- [ ] contract/verify.ts: VerifyRequest, VerifyOutcome, AgentKey, effectiveLevel, frameUntrusted — effective-level.test.ts, frame-untrusted.test.ts
- [ ] contract/policy.ts: parseMandatYml, repoConfigFromPolicy — policy.test.ts, unsupported-runner.test.ts
- [ ] core/ladder.ts — ladder.test.ts
- [ ] core: D2:weakened — d2-weakened.test.ts
- [ ] D2:weakened_assertions (AST) — d2-weakened-assertions.test.ts, d2-weakened-fp.test.ts
- [ ] D2:report_mismatch — report-mismatch.test.ts
- [ ] D1:flaky_history по (base_sha, tree_sha, config_hash) — retry-same-tree.test.ts
- [ ] packages/verify: преместени phases/test, trees, gate, sandbox-exec; verifyChange; loadPolicyFromBase — k1-base-policy.test.ts
- [ ] mandat-verify bin + доверен base в огледало — base-pinning.test.ts, verify-no-write.test.ts
- [ ] `mandat verify` в cli = псевдоним (процес)
- [ ] verify-cli.docker.test.ts, external-weaken.docker.test.ts
- [ ] supabase/: config.toml, migrations (т. 5.2), private схема, RLS (т. 5.3), ledger_append (т. 5.4)
- [ ] supabase/tests/*.sql (pgTAP): rls_matrix, ledger_append, ledger REVOKE, outbox unique, approvals_method_check
- [ ] ledger онлайн (pg) + `mandat verify-log --org <uuid>`
- [ ] outbox (drainOutbox) — outbox.test.ts
- [ ] lease + sweeper — lease.test.ts; state machine минимум (т. 5.8)
- [ ] git-safety.test.ts (T3-7 статичен grep; core.fsync за огледалата)
- [ ] `mandat ladder sim`
- [ ] `mandat bench --fail-gate` — bench-fail-gate.docker.test.ts
- [ ] RFC 3161 котва (pkijs) с записан отговор; live само с MANDAT_LIVE_TSA=1
- [ ] `mandat demo seed --minimal`
- [ ] docs/setup/supabase.md, docs/setup/tsa.md

## Готово, когато
- [ ] pnpm db:start && pnpm db:reset → миграциите минават; pnpm test:db → pgTAP зелени
- [ ] pnpm check → зелено (покритие ≥ 90% lines за contract, core, ledger, verify)
- [ ] pnpm mandat verify … --external --type bugfix → FAILED D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50, exit 20
- [ ] node scripts/check-test-counts.mjs → skipped: N (изброени)
- [ ] pnpm mandat verify-log --org <demo org uuid> → "OK: chain intact …"
- [ ] pnpm mandat ladder sim --p 0.95 --h 5 → число + сравнение с ≈ 87
- [ ] pnpm mandat bench → 8/8; pnpm mandat bench --fail-gate → exit 1
