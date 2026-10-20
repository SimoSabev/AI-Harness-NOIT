# E1а — лиценз и граници на пакетите (docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md т. 4)

- [x] packages/<ядро>/LICENSE (Apache-2.0), NOTICE, licenses/LICENSE-GPL-3.0-or-later.txt, package.json license/files
- [x] license-allowlist.json по групи (core / harness)
- [x] scripts/license-groups.mjs + scripts/check-licenses.mjs по групи
- [x] scripts/scripts.test.ts: GPL транзитивно в ядрото → fail; MPL в ядрото → fail; MPL в харнеса → ok
- [x] scripts/license-groups.test.ts: група, import-и, workspace зависимости, LICENSE sha256/NOTICE/license, mcp/verifyd → mandat-verify
- [x] scripts/set-core-license.mjs + scripts/set-core-license.test.ts
- [x] scripts/check-test-counts.mjs + scripts/check-test-counts.test.ts; passWithNoTests: false
- [x] Docker тестът на пясъчника → apps/worker (D-260)
- [x] CLAUDE.md и AGENTS.md: блок mandat-coder
- [x] D-200…D-239 в docs/decisions.md; D-260…D-264
- [x] docs/questions-for-simo.md (Q-001…Q-018)
- [x] .env.example (т. 0.7), README „Лицензи“
- [x] Готово, когато: `pnpm licenses:check` → "licenses ok (core: N packages, harness: M packages)"
- [x] Готово, когато: `pnpm check` → зелено
- [x] Готово, когато: `node scripts/check-test-counts.mjs` → skipped: N (изброени)
- [x] Готово, когато: редът от т. 0.8 (а) е в CLAUDE.md и AGENTS.md
- [x] Готово, когато: `node scripts/set-core-license.mjs --mode dual --dry-run` показва промените, без да пише
