# Web push (чака Симо: VAPID ключове, телефон)

1. На твоята машина: `npx web-push generate-vapid-keys --json` → publicKey, privateKey. Не ги слагай в репото.
2. Worker (само в неговия терминал): `VAPID_SUBJECT=mailto:<ти> VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… pnpm mandat worker`.
3. Web: `VAPID_PUBLIC_KEY=…` (публичният ключ; частният НИКОГА в web/Vercel).
4. Телефон: Android/Chrome — „Включи известия“ в inbox; iPhone (iOS ≥ 16.4) — Сподели → „Добави към началния екран“, отвори
   Мандат оттам, после „Включи известия“.
5. Известие идва при: нещо в „Чака теб“, ПРОВАЛ, слято само (ниво ≥ 2). Без ключове worker-ът пише `[push] SKIPPED`.
