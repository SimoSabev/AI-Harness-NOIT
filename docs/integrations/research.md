# Ресърч (E9г)

Ресърчът е услуга на харнеса: въпрос → план → ленти паралелно (заявки → собствено търсене → четене на страници → дословни
цитати → празнини) → твърдения с присъда → отговор с цитати → доклад. Всяка стъпка се вижда на живо. Решения: D-393…D-402;
стратегиите: [docs/prd/research/research-strategies.md](../prd/research/research-strategies.md).

## Бърз старт
```bash
pnpm build
pnpm mandat research demo --out /tmp/demo.html     # записан свят, без ключ и мрежа: потокът в терминала + доклад
pnpm mandat research engine start                  # собствената търсачка (SearXNG на 127.0.0.1:8888)
pnpm local                                         # уеб + работник; Проучване → Ново проучване
```
От терминала (с `pnpm local` в друг прозорец): `pnpm mandat research ask "въпрос" --depth standard --goal balanced --out r.html`.

## Модели (всичко, което си вързал)
| Канал | Как | Цена |
| --- | --- | --- |
| API ключ (Anthropic, OpenAI, връзки D-392) | през llm-proxy с mdt_ токен с бюджета на рън-а; проксито трябва да върви (`pnpm mandat proxy start` или „Ключове“) | по токени |
| Абонамент (`mandat login`) | непромененият `claude -p` без инструменти в контейнера на профила | $0 (лимитът на абонамента) |
| Локален модел | OpenAI-съвместим сървър, `MANDAT_LOCAL_MODEL_URL` (по подразбиране Ollama `http://127.0.0.1:11434/v1`) | $0 |

Целта разпределя ролите: **икономично** — най-евтиното достатъчно добро навсякъде; **балансирано** — силният модел планира и
пише, евтините четат; **качество** — най-добрият навсякъде, където има значение. Във „Още настройки“ всяка от седемте роли
може да се фиксира на модел.

## Търсене
- Винаги: SearXNG (ако върви), Wikipedia, arXiv, GitHub, Stack Exchange; Crossref с `MANDAT_RESEARCH_MAILTO`.
- С Anthropic ключ: Anthropic web search през проксито.
- Exa: `EXA_API_KEY=… pnpm mandat proxy start` (ключът се запечатва и живее само в проксито).

## Четене на страници
HTTP (robots.txt, ≤ 2 заявки на сайт, SSRF защита) → истински Chromium за JS страници (нужен е UI образът:
`pnpm mandat images build --ui`) → копие от Wayback Machine при отказ → Exa contents. Стените срещу ботове и CAPTCHA не се
заобикалят: източникът е „blocked“ и ресърчът минава към копие или друг източник.

## За агентите
- Умението `research` е вградено (packages/profile/src/research-skill.ts).
- MCP сървър за агент на този компютър: `claude mcp add research -- node packages/research-mcp/dist/main.js`
  (с `MANDAT_DB_URL` за research_ask/research_recall). В пясъчника — след бриджа на E8д.

## Променливи
`MANDAT_SEARXNG_URL`, `MANDAT_LOCAL_MODEL_URL`, `MANDAT_RESEARCH_MAILTO`, `MANDAT_PROXY_INFERENCE_PORT` (8787),
`MANDAT_RESEARCH=0` (работникът без ресърч), `EXA_API_KEY` (само при `proxy start`).
