# E8д — MCP каталог, vetting, sidecar, скилове (v5 т. 4.5)
- [x] packages/mcp-bridge/src/vet.test.ts (хеш на дефинициите; невидими знаци и инструкции → находка с инструмента; друг хеш → changed) — „mcp-vetting“
- [x] packages/mcp-bridge/src/registry.test.ts (/v0.1/servers; точна версия; stdio npm пакет / streamable-http remote)
- [x] packages/mcp-bridge/src/bridge.test.ts (stdio → streamable HTTP; enabled_tools; блок при отрова / друг хеш / tools/list_changed)
- [x] packages/mcp-bridge/src/spec.test.ts (тайните само по име)
- [x] supabase/tests/mcp_catalog.test.sql (точни версии, vet_status, mcp_tool_defs RLS, profile_layer_version)
- [x] apps/worker/src/online/mcp.test.ts (mcp_vet → approved + слой E; находки → blocked; блок при старт → security_event)
- [x] apps/web/src/lib/server/mcp.test.ts (добавяне от регистъра, ръчно; одобрение с TOTP при изход навън → outbox mcp_vet)
- [x] packages/egress-gate/src/gate.test.ts › MCP routes (маршрут към sidecar-а, бюджет в минута → 429; scoped packument)
- [x] packages/sandbox/src/mcp-role.test.ts (роля mcp: hardening, само обявени тайни, само собствен volume)
- [x] apps/worker/src/mcp-sidecar.docker.test.ts (vetting без мрежа; sidecar: без /m/work на агента, без LLM ключ, без интернет; тайната не е в агента; повикване през вратата) — „mcp-sidecar.docker“
- [x] packages/onboard/src/skills.test.ts, packages/profile/src/builtin-skills.test.ts, apps/worker/src/online/skills.test.ts — „skills-catalog“
- [x] apps/web/e2e/skills.spec.ts (блокиран скил с причина; скил на харнеса)
- [x] docs/integrations/mcp-catalog.md
Готово, когато:
- [x] AC-5.1 (хеш в дневника; промяна → блок с карта/статус „блокиран“)
- [x] AC-5.2 (невидим знак / „ignore previous“ → блок с посочен инструмент)
- [x] AC-5.3 (sidecar: без файловете на агента, без мрежа освен обявеното (днес: никаква), тайната не е в env на агента)
- [x] AC-5.7 (скил с невидим знак → блок; скил на харнеса видим с „ползван от N“)
Отворено (D-354): egress на stdio сървъри към обявени хостове и http (отдалечени) сървъри — втора врата [НП].
