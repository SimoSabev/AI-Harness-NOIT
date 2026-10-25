# Доклад E7в — ключовете оцеляват рестарт; проксито без ключ в env (22.10.2026)

## Статус: ГОТОВО (live чака Симо; safeStorage → E9ж)

## Какво е направено (D-313, D-345)
| Част | Решение | Проверено |
| --- | --- | --- |
| Запечатване | AES-256-GCM, нов nonce, доставчикът е AAD; KEK от `MANDAT_KEK` или `$MANDAT_HOME/kek` (0600) | unit envelope |
| Хранилище | локално `keys.sealed.json` (0600); онлайн `private.api_keys` (само service role) + outbox `proxy_restart` | unit, pgTAP, PGlite |
| Проксито | заключен старт, `POST /admin/boot` с еднократен `mdt_boot_` (60 s); маркер за изразходван токен в state volume-а | unit + docker |
| CLI | `proxy start` пуска само с токена; ключовете — от env (и се запечатват) или от хранилището; `pnpm local` лекува заключено прокси на 30 s | unit |

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| `pnpm check` | exit 0 | ✓ |
| keys-restart.docker.test.ts | `✓ locked → boot → works; inspect has no key; restart → locked (spent token) → a new token → works` | ✓ |
| AC-3.8 | рестарт → без ново въвеждане (docker + proxy-heal) | ✓ |
| AC-12.9 | файл/env ✓; safeStorage → E9ж | частично |

## Чака Симо
Чеклист стъпки 1 и 8: ключ през UI, рестарт на `pnpm local`, задача без повторно въвеждане.

## Разход API: $0
