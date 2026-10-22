# Доклад E8в — роли с capabilities (22.10.2026)

## Статус: ГОТОВО
`public.roles` (вградени `builtin:<име>`, read-only; собствени на org-а), `members.role_id`, `private.has_cap/cap_of` с обхват;
`private.authorize` вече е през capabilities, така всички RLS политики са по права. Одобренията: ниво ≥ 2 → approve.level2 с
repo/вид/ниво; правилата → approve.rules. API `/api/roles`, `/api/roles/:id`, `/api/members/:id/role` + ledger `role_change`;
ключовете → keys.manage. UI `/settings/roles` (en/bg). Решение D-349.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| pgTAP | 11 файла зелени (rls_roles: 17/17) | ✓ |
| unit | roles API 4/4 | ✓ |
| e2e | settings.spec 4/4 (с ролите); a11y 4/4 | ✓ |

## Разход API: $0
