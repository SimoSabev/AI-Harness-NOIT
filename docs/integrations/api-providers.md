# Доставчици на модели: къде отива ключът

Този файл казва за всеки доставчик на модели как се говори с него, къде се взема ключ и как се проверява, че ключът работи.
Агентите в пясъчника разбират само три „езика“. Claude Code иска Anthropic Messages (`POST {base}/v1/messages`).
Codex иска OpenAI Responses (`POST {base}/v1/responses`). Gemini CLI иска Gemini API (`/v1beta/models/*:generateContent`).
Ако доставчикът няма нито един от тях, засега не може да се ползва без преводач (напр. LiteLLM).
Всичко е проверено на 04.11.2026 по страниците на самите доставчици. `[НП]` = не е потвърдено от официална страница.

## Codex: само Responses

Официалният config reference на Codex казва за `model_providers.<id>.wire_api`: „`responses` is the only supported value, and it is the default when omitted“.
`chat` не се споменава изобщо. Според трети страни е премахнат като твърда грешка през февруари 2026.
Изводът: доставчик само с Chat Completions **не работи** с текущия Codex без преводач.
Източник: https://learn.chatgpt.com/docs/config-file/config-reference (пренасочено от developers.openai.com/codex/config-reference), прочетено 04.11.2026.

## Обобщена таблица

Колона „Агент“: CC = Claude Code (има Anthropic формат), CX = Codex (има Responses), GC = Gemini CLI (има Gemini native), — = засега никой.

| Доставчик | Формати | Base URL(s) | Auth | Проверка на ключ | Агент |
|---|---|---|---|---|---|
| Anthropic | Anthropic (native) | `https://api.anthropic.com` | `x-api-key` (+ `anthropic-version`) | `GET /v1/models` → 401 / 402 billing | CC |
| OpenAI | Responses, Chat | `https://api.openai.com/v1` | `Authorization: Bearer` | `GET /v1/models` → 401 / 429 `credit_balance_exhausted` | CX |
| Google Gemini (AI Studio) | Gemini native, OpenAI Chat | `https://generativelanguage.googleapis.com` ; `.../v1beta/openai/` | `x-goog-api-key` ; Bearer за OpenAI слоя | `GET /v1beta/models` → 400 (невалиден) / 402 prepay / 403 | GC |
| xAI Grok | Responses, Chat (legacy), Anthropic (deprecated) | `https://api.x.ai/v1` ; `https://api.x.ai` | Bearer ; `x-api-key` за Anthropic [НП] | `GET /v1/api-key`, `GET /v1/models` → 401 / 403 | CX (CC с риск) |
| Mistral | Chat, Responses (public preview) | `https://api.mistral.ai/v1` | Bearer | `GET /v1/models` → 401 [НП] | CX [НП] |
| DeepSeek | OpenAI Chat, Anthropic | `https://api.deepseek.com` ; `https://api.deepseek.com/anthropic` | Bearer (Anthropic: `x-api-key` [НП]) | `GET /models` → 401 / 402 „Insufficient Balance“ | CC |
| Qwen / Model Studio | Chat, Responses, Anthropic | `https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1` ; `.../apps/anthropic` | Bearer или `x-api-key` | няма list в Anthropic слоя; `GET /compatible-mode/v1/models` [НП] | CC, CX |
| Moonshot Kimi (платформа) | Chat, Responses, Anthropic | `https://api.moonshot.ai/v1` ; `https://api.moonshot.ai/anthropic` [НП] | Bearer | `GET /v1/models` [НП] | CX, CC [НП] |
| Kimi Code (абонамент) | Responses, Anthropic | `https://api.kimi.ai/coding/v1` (intl) / `https://api.kimi.com/coding/v1` (CN) ; `https://api.kimi.com/coding/` | Bearer | [НП] | CX, CC |
| Z.ai / Zhipu GLM | Chat, Responses, Anthropic | `https://api.z.ai/api/paas/v4` ; coding `.../api/coding/paas/v4` ; Responses `https://api.z.ai/api/v1` ; `https://api.z.ai/api/anthropic` ; CN `open.bigmodel.cn` [НП] | Bearer | [НП]; 401 код 1000 / 429 код 1113 | CC, CX |
| MiniMax | Chat, Responses, Anthropic | `https://api.minimax.io/v1` ; `https://api.minimax.io/anthropic` ; CN `api.minimaxi.com` [НП] | Bearer | `GET /v1/models` → код 1004/2049 / 1008 | CC, CX |
| Baidu ERNIE (Qianfan) | OpenAI Chat, Anthropic | `https://qianfan.baidubce.com/v2` ; `https://qianfan.baidubce.com/anthropic` | Bearer | [НП] | CC |
| ByteDance Doubao (Volcengine Ark) | Chat, Anthropic (coding), Responses [НП] | `https://ark.cn-beijing.volces.com/api/v3` ; coding `.../api/coding` и `.../api/coding/v3` | Bearer | [НП] | CC |
| BytePlus ModelArk | Chat, Anthropic (coding) | `https://ark.ap-southeast.bytepluses.com/api/v3` ; coding `.../api/coding` | Bearer | [НП] | CC |
| Tencent Hunyuan | OpenAI Chat, Anthropic | `https://api.hunyuan.cloud.tencent.com/v1` ; `https://api.hunyuan.cloud.tencent.com/anthropic` | Bearer | [НП] | CC |
| OpenRouter | Chat, Responses [НП-частично], Anthropic | `https://openrouter.ai/api/v1` ; `https://openrouter.ai/api` | Bearer | `GET /api/v1/key` → 401 / 402 | CC, CX |
| Groq | Chat, Responses | `https://api.groq.com/openai/v1` | Bearer | `GET /openai/v1/models` → 401 | CX |
| Together AI | Chat, Responses, Anthropic [НП-адрес] | `https://api.together.ai/v1` | Bearer | `GET /v1/models` → 401 [НП] | CX |
| Fireworks AI | Chat, Anthropic, Responses [НП] | `https://api.fireworks.ai/inference/v1` ; `https://api.fireworks.ai/inference` | Bearer | [НП] | CC |
| Cerebras | Chat | `https://api.cerebras.ai/v1` | Bearer | `GET /v1/models` [НП] | — |
| Perplexity | Agent API (Responses формат), Sonar Chat | `https://api.perplexity.ai` (`/v1/agent`, псевдоним `/v1/responses`) | Bearer | [НП] | CX [НП] |
| Cohere | Cohere native v2, OpenAI Chat (compat) | `https://api.cohere.ai/compatibility/v1` | Bearer | 401 / 402 billing / 429 trial | — |
| Azure OpenAI / Foundry | Responses, Chat (v1 API); Anthropic (Claude в Foundry) | `https://{resource}.openai.azure.com/openai/v1/` ; `https://{resource}.services.ai.azure.com/anthropic` | `api-key` или Entra Bearer | `GET /openai/v1/models` [НП] | CX, CC |
| AWS Bedrock | Bedrock Invoke/Converse, Responses+Chat, Anthropic (Mantle) | `https://bedrock-runtime.{region}.amazonaws.com/openai/v1` ; `https://bedrock-mantle.{region}.api.aws/v1` | SigV4 или Bedrock API key (Bearer) | mantle: `GET /v1/models`; runtime: ListFoundationModels | CC (native режим), CX |
| Google Vertex AI | Gemini native, OpenAI Chat, Anthropic (Claude rawPredict) | `https://aiplatform.googleapis.com/v1/projects/{p}/locations/{l}/endpoints/openapi` | OAuth access token (Bearer, 1 ч.) | [НП] | CC (native режим), GC |
| Ollama | Chat, Responses (stateless), Anthropic | `http://localhost:11434/v1` ; `http://localhost:11434` | без ключ локално; облак Bearer | `GET /v1/models` | CC, CX |
| LM Studio | Chat, Responses, Anthropic | `http://localhost:1234/v1` ; `http://localhost:1234` | по избор (`x-api-key` или Bearer) | `GET /v1/models` | CC, CX |
| vLLM | Chat, Responses, Anthropic | `http://{host}:8000/v1` (порт [НП]) | `--api-key` → Bearer [НП] | `GET /v1/models` | CC, CX |
| Всеки OpenAI-съвместим адрес | зависи | `{base}/v1` | Bearer | `GET {base}/v1/models` | CX само ако има `/v1/responses` |

---

## Anthropic
- Формат: native Anthropic Messages. `ANTHROPIC_BASE_URL` = `https://api.anthropic.com`.
- Auth: `x-api-key: <key>` + `anthropic-version`. Примерът на List Models ползва `Authorization: Bearer` и също работи.
- Проверка: `GET https://api.anthropic.com/v1/models`. Лош ключ → 401 `authentication_error`. Без пари → 402 `billing_error`. Достигнат спенд-лимит → 400 (или 429 за Claude Code workspace). Таван на месечен спенд → 429 без `retry-after`.
- Модели: `claude-opus-5-5` (най-добър за агентно кодене по default препоръка), `claude-sonnet-5-5` (баланс), `claude-haiku-5-5` (бърз). За най-тежки задачи: `claude-fable-5-1`.
- Ключ: https://platform.claude.com/ (Console → API keys) [НП за точния път].
- Източници: https://platform.claude.com/docs/en/about-claude/models/overview , https://platform.claude.com/docs/en/api/errors , https://platform.claude.com/docs/en/api/models/list — прочетено 04.11.2026.

## OpenAI
- Формати: Responses (`POST /v1/responses`) и Chat Completions. Base `https://api.openai.com/v1`.
- Auth: `Authorization: Bearer`.
- Проверка: `GET /v1/models`. Лош ключ → 401 „Incorrect API key provided“. Без кредит → 429 с код `credit_balance_exhausted`; спенд лимити → 429 `organization_spend_limit_exceeded` / `project_spend_limit_exceeded`. Типът може да е `insufficient_quota` — гледай `error.code`. 403 = неподдържана държава.
- Модели: `gpt-6-astra` (флагман, reasoning и код), `gpt-6.1-sol` (баланс), `gpt-6.1-terra` (бърз), `gpt-6-luna` (най-евтин). Codex-специфични модели не са в списъка.
- Ключ: https://platform.openai.com/api-keys [НП за текущия адрес след преместването на документацията].
- Източници: https://developers.openai.com/api/docs/models , https://developers.openai.com/api/docs/guides/error-codes — прочетено 04.11.2026.

## Google Gemini (AI Studio)
- Формати: Gemini native `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`; OpenAI Chat на `https://generativelanguage.googleapis.com/v1beta/openai/` (Responses не е документиран).
- Auth: native `x-goog-api-key`; OpenAI слой `Authorization: Bearer`.
- Gemini CLI към прокси: `GOOGLE_GEMINI_BASE_URL` (поправено в gemini-cli PR #25357, април 2026) + ключ в `GEMINI_API_KEY`.
- Проверка: `GET https://generativelanguage.googleapis.com/v1beta/models` (или `/v1beta/openai/models`). Невалиден ключ → 400. Изчерпан Prepay кредит → 402. Неплатен баланс / free tier / изтекъл ключ → 403 `PERMISSION_DENIED`. 429 `RESOURCE_EXHAUSTED` = rate limit.
- Модели: `gemini-3.8-flash` (препоръчан за агентно кодене), `gemini-4-argon` (флагман reasoning), `gemini-3.1-pro-preview`, `gemini-3.5-flash-lite` (бърз/евтин).
- Ключ: https://aistudio.google.com/apikey [НП].
- Източници: https://aistudio.google.com/docs/models , https://aistudio.google.com/docs/troubleshooting , https://aistudio.google.com/docs/openai , https://github.com/google-gemini/gemini-cli/pull/25357 — прочетено 04.11.2026.

## xAI Grok
- Формати: Responses (`POST https://api.x.ai/v1/responses`, препоръчан); Chat Completions (legacy, без нови функции); Anthropic `/v1/messages` — **напълно deprecated** според страницата „Legacy & Deprecated“. Anthropic base `https://api.x.ai` [НП дали още отговаря].
- Auth: `Authorization: Bearer`.
- Проверка: `GET /v1/api-key` (връща статус, blocked/disabled, права) и `GET /v1/models`. 401 = липсващ/невалиден ключ; 403 = няма права или екипът е блокиран. Сигнал за изчерпан кредит: [НП].
- Модели: `grok-4.7` (най-добър, и за код), `grok-4.6`, `grok-build-0.1` (най-евтин, предназначение [НП]).
- Ключ: https://console.x.ai [НП].
- Източници: https://docs.x.ai/docs/models , https://docs.x.ai/docs/api-reference , https://docs.x.ai/developers/rest-api-reference/inference/legacy , https://docs.x.ai/developers/debugging — прочетено 04.11.2026.

## Mistral
- Формати: Chat `https://api.mistral.ai/v1/chat/completions`; Responses `POST https://api.mistral.ai/v1/responses` (public preview, stateless: `previous_response_id`, `store` и др. трябва да са null → съвместимостта с Codex е [НП]). Anthropic формат няма.
- Auth: `Authorization: Bearer`.
- Проверка: `GET /v1/models` (линк в API reference). Статуси за лош ключ / без кредит: [НП].
- Модели: Mistral Medium 3.5 (замества Devstral за код; API id вероятно `mistral-medium-3-5` или `mistral-medium-3.5` — [НП], страницата се противоречи), `mistral-large-latest` (Large 4), `mistral-small-latest` (Small 4), `codestral-latest` (completion) [НП за алиасите].
- Ключ: https://console.mistral.ai/api-keys [НП].
- Източници: https://docs.mistral.ai/getting-started/models/ , https://docs.mistral.ai/api , https://docs.mistral.ai/api/endpoint/responses — прочетено 04.11.2026.

## DeepSeek
- Формати: OpenAI Chat `https://api.deepseek.com`; Anthropic `https://api.deepseek.com/anthropic` (за Claude Code).
- Auth: `Authorization: Bearer` (в Anthropic слоя `x-api-key` [НП]).
- Проверка: `GET https://api.deepseek.com/models` [НП за пътя]. 401 „Authentication Fails“; **402 „Insufficient Balance“**; 429 „Rate Limit Reached“.
- Модели: `deepseek-v4-pro` (най-добър), `deepseek-flash` (бърз, DeepSeek-V4.1-Flash-1017). Старите `deepseek-v4-flash*` се пренасочват.
- Ключ: https://platform.deepseek.com/api_keys [НП].
- Източници: https://api-docs.deepseek.com/ , https://api-docs.deepseek.com/quick_start/error_codes — прочетено 04.11.2026.

## Qwen / DashScope (Alibaba Model Studio)
- Адресите вече съдържат WorkspaceId и регион; ключът важи само за региона, в който е създаден.
- Anthropic: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/apps/anthropic` (Сингапур), `...us-east-1...` (Вирджиния), `...cn-beijing...` (Пекин). Без `/v1` в края, иначе 404.
- OpenAI Chat и Responses: `https://{WorkspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1` (`/chat/completions`, `/responses`). За US една страница дава `https://dashscope-us.aliyuncs.com/compatible-mode/v1` — противоречие, [НП]. Пекинският адрес в един списък е объркан — проверявай в конзолата.
- Auth: `x-api-key` или `Authorization: Bearer`.
- Проверка: Anthropic слоят няма model list. OpenAI `GET .../compatible-mode/v1/models` [НП]. Статуси [НП].
- Модели: `qwen3.8-max` (най-добър), `qwen3.7-plus` (баланс), `qwen3.8-flash` (бърз), `qwen3-coder-flash` (код). В Anthropic слоя има и `deepseek-v4-pro`, `kimi-k3`, `glm-5.3`.
- Ключ: конзолата на Model Studio за съответния регион [НП за URL].
- Източници: https://www.alibabacloud.com/help/en/model-studio/anthropic-api-messages , https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope , https://www.alibabacloud.com/help/en/model-studio/compatibility-with-openai-responses-api — прочетено 04.11.2026.

## Moonshot Kimi
- Платформа (pay-as-you-go): OpenAI `https://api.moonshot.ai/v1` с **нативен Responses** (`POST /v1/responses`, Codex с `wire_api = "responses"`). Anthropic `https://api.moonshot.ai/anthropic` (CN `api.moonshot.cn/anthropic`) — от трети страни, [НП].
- Kimi Code (абонамент): Codex `https://api.kimi.ai/coding/v1` (чужбина) / `https://api.kimi.com/coding/v1` (Китай); Claude Code `ANTHROPIC_BASE_URL=https://api.kimi.com/coding/` (intl вариант `https://api.kimi.ai/coding/` [НП]).
- Auth: Bearer; Codex чете `KIMI_API_KEY`.
- Проверка: `GET /v1/models` [НП]; статуси [НП].
- Модели: платформа `kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed`; Kimi Code `k3.1-pro`, `k3.1-pro-highspeed`, `kimi-for-coding`.
- Ключ: https://platform.kimi.ai (платформа) и https://www.kimi.com/code (Kimi Code) [НП за точните страници].
- Източници: https://platform.kimi.ai/docs/guide/agent-support , https://platform.kimi.ai/docs/guide/codex-kimi.md , https://www.kimi.com/code/docs/en/third-party-tools/codex.html — прочетено 04.11.2026.

## Zhipu / Z.ai GLM
- z.ai (USD): общ `https://api.z.ai/api/paas/v4`; Coding Plan Chat `https://api.z.ai/api/coding/paas/v4`; Responses `https://api.z.ai/api/v1`; Anthropic `https://api.z.ai/api/anthropic` (ключ в `ANTHROPIC_AUTH_TOKEN`). Грешен адрес = не се ползва квотата на Coding Plan.
- bigmodel.cn (CNY): `https://open.bigmodel.cn/api/anthropic`, `https://open.bigmodel.cn/api/paas/v4` — само от трети страни, [НП].
- Auth: `Authorization: Bearer`.
- Проверка: model list [НП]. Грешки: 401 с код 1000/1001/1003; 429 с код **1113** = недостатъчен баланс; 1308/1310 = изчерпан лимит на плана; 1302 = rate limit.
- Модели: `glm-5.3` (флагман), `glm-5.3-flash` (бърз), `glm-5.3-flashx` [НП за id], `glm-5.2`.
- Ключ: https://z.ai/manage-apikey/apikey-list [НП].
- Източници: https://docs.z.ai/devpack/tool/claude , https://docs.z.ai/devpack/tool/others.md , https://docs.z.ai/api-reference/introduction , https://docs.z.ai/api-reference/api-code.md , https://docs.z.ai/guides/overview/overview.md — прочетено 04.11.2026.

## MiniMax
- Формати: OpenAI Chat и Responses на `https://api.minimax.io/v1` (Codex с `wire_api = "responses"`); Anthropic `https://api.minimax.io/anthropic`. Китай: `api.minimaxi.com` [НП].
- Auth: `Authorization: Bearer`; за Claude Code — `ANTHROPIC_AUTH_TOKEN`.
- Проверка: `GET https://api.minimax.io/v1/models`. Бизнес кодове: 1004/2049 = лош ключ; **1008** = insufficient balance, 2053 = insufficient credit; 1002 = rate limit. HTTP статус не е даден [НП].
- Модели: `MiniMax-M3` , `MiniMax-M3.1-Flash` (и двата за код, 1M контекст).
- Ключ: Account Management → API Keys на https://platform.minimax.io [НП за URL].
- Източници: https://platform.minimax.io/docs/m-plan/claude-code.md , https://platform.minimax.io/docs/m-plan/codex.md , https://platform.minimax.io/docs/api-reference/errorcode.md , https://platform.minimax.io/docs/api-reference/models/openai/list-models.md , https://platform.minimax.io/docs/guides/models-intro.md — прочетено 04.11.2026.

## Baidu ERNIE (Qianfan)
- Формати: OpenAI Chat `https://qianfan.baidubce.com/v2` (`/chat/completions`); Anthropic `https://qianfan.baidubce.com/anthropic` (общ), `.../anthropic/coding` (Coding Plan, модел `qianfan-code-latest`), `.../anthropic/tokenplan/personal`. Ключовете на плановете не са взаимозаменяеми.
- Auth: Bearer; за Claude Code `ANTHROPIC_AUTH_TOKEN` или `ANTHROPIC_API_KEY` според плана.
- Проверка и статуси: [НП].
- Модели: `ernie-5.1` [НП — от трети страни], `deepseek-v4-pro`, `qianfan-code-latest`.
- Ключ: конзолата на Qianfan [НП].
- Източници: https://cloud.baidu.com/doc/qianfan/s/0mn2mnemj , https://cloud.baidu.com/doc/qianfan-docs/s/6mh3e6gjp (видени в търсене, не отворени директно) — прочетено 04.11.2026. Цялата секция е [НП] до директно прочитане.

## ByteDance Doubao (Volcengine Ark) и BytePlus ModelArk
- Volcengine (Китай): общ `https://ark.cn-beijing.volces.com/api/v3` [НП — не е на прочетената страница]; Coding Plan: Anthropic `https://ark.cn-beijing.volces.com/api/coding`, OpenAI `https://ark.cn-beijing.volces.com/api/coding/v3`. Общият адрес не харчи квотата на плана.
- BytePlus (международно): общ `https://ark.ap-southeast.bytepluses.com/api/v3`; Coding Plan Anthropic `https://ark.ap-southeast.bytepluses.com/api/coding`, OpenAI `.../api/coding/v3`.
- Auth: Bearer; за Claude Code `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_MODEL`.
- Responses API: [НП].
- Проверка и статуси: [НП].
- Модели: `ark-code-latest` (избира се в конзолата), `Doubao-Seed-2.0-Code`, `kimi-k2.5`, `GLM-4.7`.
- Ключ: API Key management в конзолата на Ark / ModelArk [НП за URL].
- Източници: https://www.volcengine.com/article/38135 , https://docs.byteplus.com/en/docs/ModelArk/1928262 (през търсене) — прочетено 04.11.2026.

## Tencent Hunyuan
- Формати: OpenAI Chat `https://api.hunyuan.cloud.tencent.com/v1`; Anthropic `https://api.hunyuan.cloud.tencent.com/anthropic`. Hunyuan се мести към TokenHub. Ключът на lkeap (Knowledge Engine) не важи тук.
- Auth: `Authorization: Bearer`.
- Проверка и статуси: [НП].
- Модели: `hunyuan-2.0-thinking-20251109`, `hunyuan-2.0-instruct-20251111` (Anthropic слой), `hunyuan-turbos-latest` (OpenAI слой).
- Ключ: страницата API Key в конзолата на Hunyuan [НП за URL].
- Източници: https://cloud.tencent.com/document/product/1729/111007 , https://cloud.tencent.com/document/product/1729/127293 (през търсене) — прочетено 04.11.2026.

## OpenRouter
- Формати: OpenAI Chat `https://openrouter.ai/api/v1`; Responses `https://openrouter.ai/api/v1/responses` (от блога им за Codex, [НП-частично]); Anthropic `ANTHROPIC_BASE_URL=https://openrouter.ai/api` (без `/v1`), ключ в `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY=""`. Гарантирано само с Anthropic модели.
- Auth: Bearer.
- Проверка: `GET https://openrouter.ai/api/v1/key` (лимит, оставащи кредити, `is_free_tier`). 401 = невалиден ключ; **402** = няма кредити; 403 = модерация/права; 429 = rate limit.
- Модели: пълни id с префикс, напр. `anthropic/claude-opus-5-5`, `openai/gpt-6-astra`, `google/gemini-3.8-flash` [НП за точния каталог].
- Ключ: https://openrouter.ai/settings/keys [НП].
- Източници: https://openrouter.ai/docs/api/reference/errors-and-debugging , https://openrouter.ai/docs/api/reference/limits , https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration (през търсене) — прочетено 04.11.2026.

## Groq
- Формати: Chat и Responses на `https://api.groq.com/openai/v1` („All models support the Responses API“). Anthropic няма.
- Auth: Bearer.
- Проверка: `GET https://api.groq.com/openai/v1/models`. 401 лош ключ; 403; 429; 498 flex капацитет. Сигнал за липса на кредит: [НП].
- Модели: `openai/gpt-oss-120b` (най-силен), `llama-3.3-70b-versatile`, `openai/gpt-oss-20b` / `llama-3.1-8b-instant` (бързи).
- Ключ: https://console.groq.com/keys [НП].
- Източници: https://console.groq.com/docs/responses-api , https://console.groq.com/docs/errors , https://console.groq.com/docs/models — прочетено 04.11.2026.

## Together AI
- Формати: Chat и Responses на `https://api.together.ai/v1` (US-only: `https://us-api.together.ai/v1`). Anthropic Messages е обявен като поддържан, но адресът не е потвърден [НП]; официалният път за Claude Code е LiteLLM или Together Link.
- Auth: Bearer.
- Проверка: `GET /v1/models`. Статуси [НП].
- Модели: namespaced id, напр. `openai/gpt-oss-120b`; GLM-5.2 се рекламира за Claude Code [НП за id].
- Ключ: API keys в конзолата на Together [НП за URL].
- Източници: https://docs.together.ai/docs/openai-api-compatibility , https://docs.together.ai/docs/togetherlink (през търсене) — прочетено 04.11.2026.

## Fireworks AI
- Формати: OpenAI Chat `https://api.fireworks.ai/inference/v1`; Anthropic `ANTHROPIC_BASE_URL=https://api.fireworks.ai/inference` (без `/v1`), ключ в `ANTHROPIC_AUTH_TOKEN`. Responses: [НП].
- Auth: Bearer.
- Проверка и статуси: [НП].
- Модели: пълни resource имена, напр. `accounts/fireworks/models/kimi-k2p5`.
- Ключ: https://fireworks.ai/account/api-keys [НП].
- Източници: https://docs.fireworks.ai/tools-sdks/openai-compatibility , https://docs.fireworks.ai/tools-sdks/anthropic-compatibility — прочетено 04.11.2026.

## Cerebras
- Формати: OpenAI Chat `https://api.cerebras.ai/v1`. Responses и Anthropic не са документирани → засега без агент.
- Auth: Bearer.
- Проверка: model list [НП]; статуси [НП].
- Модели (shared): `gpt-oss-120b`, `qwen-3.8-27b`.
- Ключ: API Keys в https://cloud.cerebras.ai [НП].
- Източници: https://inference-docs.cerebras.ai/resources/openai , https://inference-docs.cerebras.ai/models/overview — прочетено 04.11.2026.

## Perplexity (Sonar / Agent API)
- Формати: Agent API в Responses формат `POST https://api.perplexity.ai/v1/agent` (псевдоним `/v1/responses`); Sonar `POST /v1/sonar` с псевдоним `/chat/completions`, който ще спре [дата НП]. Дали Codex работи с Agent API: [НП].
- Auth: Bearer.
- Проверка и статуси: [НП].
- Модели: `perplexity/sonar`, плюс чужди модели през тях (`anthropic/claude-opus-5-5`, `openai/gpt-6-astra`, `xai/grok-4.7` …).
- Ключ: настройките на API в акаунта на Perplexity [НП за URL].
- Източници: https://docs.perplexity.ai/getting-started/models , https://docs.perplexity.ai/docs/sonar/openai-compatibility (през търсене) — прочетено 04.11.2026.

## Cohere
- Формати: native Cohere v2; OpenAI Chat compat `https://api.cohere.ai/compatibility/v1` (в един пример `api.cohere.com`). Без Responses и Anthropic → засега без агент.
- Auth: Bearer.
- Проверка: list path [НП]. 401 = липсващ/невалиден/изтекъл ключ; **402** = достигнат billing лимит; 429 = rate limit (trial ключ: 40 заявки/мин).
- Модели: `command-a-plus-05-2026` (агентен), `command-a-reasoning-08-2025`, `command-r7b-12-2024` (бърз); за код Cohere сочи `north-mini-code-1.0`.
- Ключ: https://dashboard.cohere.com/api-keys [НП].
- Източници: https://docs.cohere.com/docs/compatibility-api , https://docs.cohere.com/reference/errors , https://docs.cohere.com/docs/models — прочетено 04.11.2026.

## Azure OpenAI / Microsoft Foundry
- OpenAI модели: v1 API `https://{resource}.openai.azure.com/openai/v1/` (Responses и Chat под него [НП за пълния списък, видян е Chat]). Auth: `api-key: <key>` или Entra ID Bearer (scope `https://cognitiveservices.azure.com/.default`). „model“ = името на deployment-а.
- Claude модели в Foundry: `https://{resource}.services.ai.azure.com/anthropic`; Claude Code с `CLAUDE_CODE_USE_FOUNDRY=1`, `ANTHROPIC_FOUNDRY_RESOURCE` или `ANTHROPIC_FOUNDRY_BASE_URL`, ключ в `ANTHROPIC_FOUNDRY_API_KEY` (или Entra).
- Проверка: `GET .../openai/v1/models` [НП]; статуси [НП].
- Ключ: Endpoints and keys на ресурса в https://ai.azure.com/.
- Източници: https://learn.microsoft.com/en-us/azure/ai-foundry/openai/latest , https://code.claude.com/docs/en/microsoft-foundry — прочетено 04.11.2026.

## AWS Bedrock
- Claude Code: native Bedrock режим (`CLAUDE_CODE_USE_BEDROCK=1`, `AWS_REGION`, ключ `AWS_BEARER_TOKEN_BEDROCK` или SigV4 credential chain; `ANTHROPIC_BEDROCK_BASE_URL` за gateway) или Mantle (`CLAUDE_CODE_USE_MANTLE=1`, Anthropic формат). Не е обикновен `ANTHROPIC_BASE_URL`.
- OpenAI: Responses и Chat на `https://bedrock-runtime.{region}.amazonaws.com/openai/v1` (препоръчан) или `https://bedrock-mantle.{region}.api.aws/v1`. Ключ: Bedrock API key като Bearer.
- Проверка: на mantle `GET /v1/models`; на runtime list **не работи** → ListFoundationModels / ListInferenceProfiles.
- Модели: `us.anthropic.claude-opus-5-5` / `global.anthropic.claude-opus-5-5`, `anthropic.claude-sonnet-5-5`; OpenAI през `global.openai.gpt-5.6-sol`.
- Ключ: Bedrock console → API keys [НП за URL].
- Източници: https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html , https://code.claude.com/docs/en/amazon-bedrock — прочетено 04.11.2026.

## Google Vertex AI (Agent Platform)
- Claude Code: `CLAUDE_CODE_USE_VERTEX=1`, `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID`, по избор `ANTHROPIC_VERTEX_BASE_URL`; auth = Google ADC (OAuth).
- Gemini CLI: Vertex режим (`GOOGLE_VERTEX_BASE_URL` за прокси според PR #25357).
- OpenAI Chat: `https://aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/endpoints/openapi`, модели `google/gemini-3.5-flash`. Само OAuth access token (живее 1 ч.); Responses не е документиран.
- Обикновен API ключ не стига → неудобно за „постави ключ“; изисква service account.
- Източници: https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/openai , https://code.claude.com/docs/en/google-vertex-ai — прочетено 04.11.2026.

## Ollama
- Формати: OpenAI `http://localhost:11434/v1` (Chat, Responses — stateless, от v0.13.3); Anthropic `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_AUTH_TOKEN=ollama` (игнорира се). Облак: `https://ollama.com/v1` с `OLLAMA_API_KEY` (Bearer; `x-api-key` не се приема).
- Проверка: `GET /v1/models`.
- Модели: каквото е изтеглено локално (напр. `gpt-oss:20b`, `qwen3:8b`).
- Източници: https://docs.ollama.com/api/anthropic-compatibility , https://docs.ollama.com/api/openai-compatibility — прочетено 04.11.2026.

## LM Studio
- Формати: OpenAI `http://localhost:1234/v1` (`/models`, `/responses`, `/chat/completions`); Anthropic `ANTHROPIC_BASE_URL=http://localhost:1234`, `ANTHROPIC_AUTH_TOKEN=lmstudio`.
- Auth: по избор („Require Authentication“) — `x-api-key` или Bearer.
- Проверка: `GET /v1/models`.
- Източници: https://lmstudio.ai/docs/developer/openai-compat , https://lmstudio.ai/docs/developer/anthropic-compat — прочетено 04.11.2026.

## vLLM
- Формати: `/v1/chat/completions`, `/v1/responses`, `/v1/messages`, `/v1/messages/count_tokens`, `/v1/models`.
- Auth: флаг `--api-key` → `Authorization: Bearer` [НП — не е на прочетената страница]; порт 8000 по подразбиране [НП].
- Източник: https://docs.vllm.ai/en/latest/serving/online_serving/ — прочетено 04.11.2026.

## Всеки OpenAI-съвместим адрес
За да го ползва агент, сървърът трябва да има:
- `GET {base}/v1/models` с `Authorization: Bearer` — за проверка на ключа и списък модели (401 при лош ключ).
- За Codex: `POST {base}/v1/responses` със стрийминг (SSE), function tools и `reasoning` полета. Само `/v1/chat/completions` **не стига** (вж. раздела за Codex).
- За Claude Code: `POST {base}/v1/messages` (Anthropic формат, SSE), желателно `POST /v1/messages/count_tokens`, и препращане на `anthropic-version` и `anthropic-beta`. Claude Code приема `ANTHROPIC_BASE_URL` без `/v1`.
- Източници: https://code.claude.com/docs/en/llm-gateway (+ llm-gateway-protocol), https://learn.chatgpt.com/docs/config-file/config-reference — прочетено 04.11.2026.

## Как е вързано в Мандат (D-470 … D-476)

- Каталогът е `packages/contract/src/provider-catalog.ts`: един запис на доставчик, проверен със zod. Нов доставчик е един
  ред там. Агентът следва формата: Anthropic → Claude Code, Responses → Codex, Gemini → Gemini CLI.
- Базовият адрес в каталога е без последното `/v1`: проксито и проверката добавят `/v1/messages`, `/v1/responses`,
  `/v1/chat/completions`.
- „Провери ключа“ праща една заявка за 1 токен (`packages/llm-proxy/src/key-check.ts`). Резултатът е: работи, отказан,
  няма кредит или не отговаря.
- Ключът се запечатва на този компютър и живее само в проксито. Страницата `/settings/api-keys` вижда последните 4 знака.
