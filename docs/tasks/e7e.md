# E7д — сесията на агента на живо (v5 т. 3.5)
- [x] apps/worker/src/online/stream-to-workbench.test.ts (фикстура с подагент → лидер + подагент, повиквания с решения, отказан push, терминал, ≤ 2/s)
- [x] supabase/tests/session_lines.test.sql (RLS)
- [x] apps/web/src/lib/sample-off-in-prod.test.ts (U4; редовете на терминала)
- [x] apps/web/e2e/workbench.spec.ts (таб „Сесия“: дърво, повиквания, терминал; production без бисквитка → без пример)
Готово, когато:
- [x] AC-6.1, AC-6.2 с fake и фикстури (live с истински агент — чеклист стъпка 2)
- [x] AC-6.5 (примерът изключен в production)
- [x] e2e зелено (18/18, локален Postgres 16)
