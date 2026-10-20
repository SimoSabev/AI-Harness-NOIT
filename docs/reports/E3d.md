# Доклад E3г — 20.10.2026

## Статус: ГОТОВО (живото известие чака Симо: VAPID, телефон)

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| Инсталируемост в Chromium (Playwright, постоянен профил) | manifest `Мандат · standalone · /`, икони 192/512, SW регистриран; `Page.getInstallabilityErrors` → `[]` | ✓ |
| `pnpm test:e2e` | 12 passed (вкл. pwa, mobile 390×844, a11y светла/тъмна) | ✓ |
| `pnpm check` | unit 464/464, lint, typecheck, licenses (core 50, harness 345), no-dotenv — exit 0; lines 89.4% | ✓ |
| `pnpm test:sentinel` | 0 hits for 5 server keys (вкл. VAPID_PRIVATE_KEY) | ✓ |
| Живо известие на телефон | SKIPPED „липсва VAPID_PRIVATE_KEY“ (не се брои) | SKIPPED |

## Тестове
нови: push-ssrf 4, push-payload 1, push-send 1 (локален фалшив endpoint: криптирано тяло aes128gcm, VAPID, 410 → изтрит,
302 → отказ без заявка към целта, без ключове → SKIPPED), push-subscribe 1, mpl-notice 1, daemon web_push, e2e pwa 2.

## Решения
D-289 (allowlist-ът — Q-029).

## Отклонения от промпта
- webpush.sendNotification не се ползва: web-push само подписва/криптира, изпращането е с pinned IP (по-строго от т. 8.4).
- Инсталируемостта се проверява с CDP в постоянен профил вместо Lighthouse.

## Сигурност
SSRF при запис и при изпращане (https, 443, allowlist по суфикс, публични IP, без редиректи, 10 s); частният VAPID ключ само в
worker-а; payload без тайни; SW не кешира данни.

## Чака Симо
VAPID ключове и телефон (docs/setup/push.md); Q-029.

## Часове и разход
план 9–12 ч / реално ≈ 2 ч · API $0

## Следващо
E4: демото (т. 9).
