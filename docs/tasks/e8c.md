# E8в — роли с capabilities и персонализирани роли (v5 т. 4.3)
- [x] supabase/tests/rls_roles.test.sql (вградени роли read-only; scope; одобрения и RLS по has_cap; матрица owner/worker/approver/agent-operator/viewer/„docs reviewer“)
- [x] apps/web/src/lib/server/roles.test.ts (API: списък, създаване, промяна, назначаване; ledger role_change; последният управляващ)
- [x] apps/web/e2e/settings.spec.ts › roles (UI /settings/roles на английски)
- [x] packages/contract/src/roles.test.ts (вградените роли, „опасно“, roleCan)
Готово, когато:
- [x] AC-8.3 (роли с capabilities; опасните отделени)
- [x] AC-8.7 (персонализирана „docs reviewer“ с обхват)
- [x] старите тестове за owner/approver/viewer са зелени без промяна на очакванията
