# Ключове за живите канали (чака Симо)

Ключовете са само в терминала на Симо, за командата, която стартира проксито. Никога в .env, в репото или в базата.

- Anthropic: `ANTHROPIC_API_KEY=… pnpm mandat proxy start` (E0).
- OpenAI (Codex, сцена 2 live): отделен проект в platform.openai.com със spend cap. Подава се на проксито заедно с цената на
  модела (USD за 1M токена; без цена моделът е model_not_allowed):
  `OPENAI_API_KEY=… MANDAT_PROXY_OPENAI_PRICES='{"<модел>":{"input":1.25,"cached_input":0.125,"output":10}}' pnpm mandat proxy start`
  [НП: стойностите са пример; Симо задава истинските от ценоразписа на OpenAI].
- Модел на канала: `update public.model_channels set model = '<модел>' where label = 'openai-key-demo'`.
- Upstream по доставчик (S33): MANDAT_UPSTREAM_ANTHROPIC, MANDAT_UPSTREAM_OPENAI (по подразбиране официалните адреси).
  Сцена 2 live: MANDAT_UPSTREAM_ANTHROPIC = stub-upstream `--429 7200`, OpenAI = истинският; картата показва „демо: лимитът е симулиран“.

Офлайн проверка без ключове: `pnpm mandat demo spill --fake`.
