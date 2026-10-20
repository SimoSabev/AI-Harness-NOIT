# E3г — PWA и web push (docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md т. 8.4)
- [x] app/manifest.ts, public/sw.js, икони 192/512; регистрация на SW; инсталируемост (CDP getInstallabilityErrors → [])
- [x] web-push 3.6.7 (MPL-2.0) само в worker-а; generateRequestDetails + наш транспорт (pinned IP, без редиректи, 10 s)
- [x] POST /api/push/subscribe с SSRF проверка; повторна проверка при всяко изпращане — push-ssrf, push-subscribe
- [x] payload ≤ 80 знака, без тайни — push-payload; outbox web_push → 1 POST — push-send; 410 → изтриване
- [x] известия: „Чака теб“, ПРОВАЛ, слято само (ниво ≥ 2) — daemon.test
- [x] mpl-notice.test.ts (т. 4.3)
- [x] iOS: „Добави към началния екран“; разрешение при клик; дъската на телефон — табове
- [x] e2e mobile 390×844: inbox → карта → одобри; цели ≥ 44 px
- [x] живо известие на телефон: SKIPPED „липсва VAPID_PRIVATE_KEY“ (docs/setup/push.md)
