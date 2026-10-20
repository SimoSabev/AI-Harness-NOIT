# RFC 3161 котва (TSA) — чеклист за Симо

Unit тестовете ползват записан отговор (fixtures/tsa/*.tsr) или локален тестов TSA ключ, генериран в теста.
Live тестът е само с `MANDAT_LIVE_TSA=1` (демо промпт т. 5.4).

1. TSA_URLS (без ключове; публични услуги): `https://freetsa.org/tsr,http://timestamp.digicert.com`.
2. Пускане: `MANDAT_LIVE_TSA=1 TSA_URLS=… pnpm vitest run --project live packages/ledger` от твоя терминал.
3. Проверка: тестът пише reports/live-<дата>.json; кодерът го чете и го цитира в доклада.
