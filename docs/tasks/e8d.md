# E8г — права субект × инструмент с „ask“, насочване, срок на HELD (v5 т. 4.4)
- [x] apps/worker/src/online/held-expiry.test.ts (held_until при влизане в HELD; sweeper → CLOSED expired + ledger + push; MANDAT_HELD_DAYS)
- [x] packages/profile/src/permissions.test.ts (tool_permissions → слой C; опасно отваряне; grantOnce; asks само за ask правила)
- [x] supabase/tests/tool_permissions.test.sql (нова версия само при сменен слой C; TOTP за net:*/git push; RLS на tool_asks)
- [x] apps/worker/src/run.test.ts › E8g (asks на изхода; grantOnce сменя policy.json) · › steering (stdin pipe, рамкирани редове)
- [x] apps/worker/src/online/daemon.test.ts › E8g (asks → HELD tool_approval, push; „веднъж“ → grantOnce в следващия опит) · › steering
- [x] apps/web/src/lib/server/permissions.test.ts (веднъж/винаги/откажи; матрица tools.manage + TOTP) · steer.test.ts
- [x] packages/agents/src/steer.test.ts (stream-json вход за Claude Code; Codex не; steer-echo)
- [x] packages/profile/src/compile.test.ts › deny-by-policy върви преди всеки инструмент
- [x] apps/worker/src/ask-flow.docker.test.ts (fake:ask-probe → истинският hook отказва → asks; с grant → VERIFIED)
- [x] apps/worker/src/steer.docker.test.ts (fake:steer-echo; текстът е в транскрипта)
- [x] apps/web/e2e/asks.spec.ts („Чака разрешение“ → „Разреши веднъж“ → „Насочи“)
Готово, когато:
- [x] AC-8.1 (deny → отказ в пясъчника и `denied`; ask → HELD tool_approval с карта; „винаги“ → ред в tool_permissions и дневника)
- [x] AC-8.5 (насочването стига до агента и е в транскрипта; Codex — обяснение вместо поле) — с fake; истинският Claude Code чака S2 live (MANDAT_STEER=1)
- [x] AC-8.6 (HELD 7 дни → CLOSED expired + известие)
