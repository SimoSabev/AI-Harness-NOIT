# Live тестове — пуска ги Симо

Кодерът не зарежда GitHub/VAPID ключове в своята среда (т. 0.5). Без нужните env тестовете са SKIPPED и не се броят за минали.

```sh
export GITHUB_DEMO_REPO=mandat-demo/shop GITHUB_WRITER_APP_ID=… GITHUB_WRITER_INSTALLATION_ID=… GITHUB_WRITER_PRIVATE_KEY="$(cat writer.pem)"
pnpm build && pnpm test:live          # отчет: test-results/live.json
cp test-results/live.json reports/live-$(date +%F).json
```
Тестове: L1 check run на тестов PR; L2 merge със стар sha → 409; L3 required „Мандат verdict“ с action_required блокира
сливането (ако не → D-209 резервата `failure`) и `context` = името на check run-а. TSA: MANDAT_LIVE_TSA=1 TSA_URLS=….
