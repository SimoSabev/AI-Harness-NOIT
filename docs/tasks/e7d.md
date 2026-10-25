# E7г — базова линия при свързване, flaky, рисков профил v1 (v5 т. 3.4)
Тестови файлове:
- [x] packages/core/src/flaky.test.ts (flakyFrom; D1 пропуска flaky с data.flaky)
- [x] packages/onboard/src/risk-profile.test.ts (папки → high/medium/low; rule:<име>; flaky и „добави тестове“)
- [x] packages/onboard/src/merge-instructions.test.ts
- [x] apps/worker/src/online/baseline.test.ts (outbox `baseline` → нов proposal; без Docker → пропуска)
- [x] apps/worker/src/baseline-on-connect.docker.test.ts (два истински пускания)
- [x] packages/cli/src/init.test.ts (`init --baseline`)

Готово, когато:
- [x] AC-1.2 базова линия при свързване (асинхронно, две пускания)
- [x] AC-1.6 рисков профил v1 със source rule:<име>
- [x] AC-1.7 няколко инструкционни файла → сливане + разлика
- [x] `pnpm mandat init --repo fixtures/demo-shop --baseline` печата базовата линия (виж доклада)
