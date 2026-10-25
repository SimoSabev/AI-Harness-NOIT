# E7в — ключовете оцеляват рестарт; проксито без ключ в env (v5 т. 3.3)
Тестови файлове:
- [x] packages/llm-proxy/src/envelope.test.ts (кръг, грешен KEK/доставчик/бит, KEK файл 0600/env, файлово хранилище)
- [x] packages/llm-proxy/src/proxy-boot-token.test.ts (заключен старт, еднократен, TTL, рестарт със същия токен → 401)
- [x] packages/cli/src/proxy-keys.test.ts, commands.test.ts (ключът никога в env на контейнера; от хранилището без env)
- [x] packages/cli/src/proxy-heal.test.ts (заключено/нездраво → нов старт; realDeps.bootProxy)
- [x] apps/worker/src/keys-restart.docker.test.ts (истински контейнер: boot → работи; inspect без ключ; restart → заключено; нов токен → работи)
- [x] supabase/tests/api_keys.test.sql (pgTAP: само service role; proxy_restart)
- [x] apps/worker/src/online/keys.test.ts (pgKeyStore)

Готово, когато:
- [x] AC-3.8 (ключовете оцеляват рестарт без ново въвеждане) — docker тест + proxy-heal
- [ ] AC-12.9 safeStorage на десктопа — файлът/env са готови; safeStorage е в E9ж ([НП] документация на Electron 44)
- [x] README „Ключове“ обновен
- [x] docs/security.md: границата D-055 махната
- [ ] живо: истински ключ през UI → рестарт → задача (чеклист стъпка 1, 8)
