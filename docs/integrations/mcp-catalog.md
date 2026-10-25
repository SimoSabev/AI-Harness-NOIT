# MCP каталог и скилове (E8д, D-354)

## Какво получава агентът
Агентът никога не стартира MCP сървър сам. Вижда го като HTTP MCP на `http://egress-gate/mcp/<име>` (Claude Code:
`/m/in/harness/claude/mcp.json`; Codex: `[mcp_servers.<име>]` в config.toml) — винаги през вратата на задачата, с бюджет
повиквания в минута (`budget_calls_min`, по подразбиране 60; над него → 429 и ред `proxy_block`).

## Как влиза сървър
1. **Добавяне** (/tools → Каталог, `tools.manage`): от официалния регистър
   (`GET https://registry.modelcontextprotocol.io/v0.1/servers`, прочетено 22.10.2026, research-tools.md §4.1) с **точна
   версия** — никога `latest`; или ръчно (stdio npm пакет@версия или https URL). Регистърът е каталог, не гаранция.
2. **Одобрение** (`tools.manage`; TOTP ≤ 2 мин, когато сървърът стига извън машината — https URL или обявен egress хост).
   Ред в дневника `mcp_change {action: approve}`; outbox `mcp_vet`.
3. **Проверка (vetting)** от worker-а: пакетът се инсталира в собствен volume през вратата (само npm, `--ignore-scripts`),
   после сървърът се пуска веднъж **без мрежа** в sidecar контейнер; бриджът чете `tools/list` и:
   - хешира `{name, description, inputSchema}` на всеки инструмент (`tools_hash` на сървъра, `mcp_tool_defs` по инструмент);
   - търси невидими знаци (bidi, zero-width, tag блок) и инструкции към модела („ignore previous“, „do not tell“,
     `<IMPORTANT>`, „read ~/.ssh“, „system prompt“) → **блокиран**, с посочен инструмент (AC-5.2);
   - чисто → `approved`, npm integrity в `digest`, и сървърът влиза в слой E на всеки одобрен профил в обхвата
     (нова версия, `tools_hash` закован).
4. **При всяко пускане** бриджът сверява хеша с одобрения; друг хеш или `notifications/tools/list_changed` по време на
   работа → сървърът спира да отговаря (503), `security_event mcp_definition_changed`, каталогът → `blocked`, нужно е
   ново одобрение (AC-5.1). Инсталиран пакет с друг integrity от одобрения не се пуска.

## Изолация на sidecar-а (AC-5.3)
Образът на пясъчника, роля `mcp` (същите флагове от SANDBOX_HARDENING, 1000:1000): само собственият volume
`mandat-mcp-<run>-<име>` на `/m/mcp` (никога `/m/work`); тайните, които редът в каталога обявява (имена; стойностите —
от хранилището на ключове), и никога LLM ключ; мрежа `mandat-mcp-<run>` (internal), в която е само вратата. Агентът не е
в тази мрежа и не вижда тайните.

## Скилове (AC-5.7)
Каталог `skills`: на харнеса (`test-first`, `review` — одобрени), на репото (`.claude/skills/*/SKILL.md`,
`.agents/skills/*/SKILL.md`, с sha256). Невидим знак → блокиран с причината. Профилът назовава скила с хеша; пускането
материализира само текст със същия хеш (променен скил от репото отпада и е в `harness.json › unsupported`). „Ползван от N“ =
сесии от последните 7 дни.

## Още не (виж D-354)
- stdio сървъри с обявени egress хостове и http (отдалечени) сървъри: нужна е втора врата за MCP изхода → [НП]; днес
  такъв сървър се добавя и проверява, но в пускането е в `unsupported`.
- Live: Claude Code 2.1.302 и Codex 0.160.1 говорят ли streamable HTTP към `http://egress-gate/mcp/<име>` (чеклист стъпка 18).
