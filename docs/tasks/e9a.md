# E9а — нощна смяна (v5 т. 5.1)
- [x] apps/worker/src/online/night-rules.test.ts (нерешимо, след присъда, предложение по клас, какво спря, доклад)
- [x] apps/worker/src/online/night.test.ts (старт, слотове, нов опит с бележка, паркиране, бюджет, край с доклад)
- [x] supabase/tests/night_shift.test.sql (night_questions, parked, shift_id, retry night)
- [x] daemon.test.ts (субект night, забранени инструменти, бележката, правилото за сливане, дневни правила след смяната)
- [x] push.test.ts (нощен доклад), cli night-ticker.test.ts, web night.test.ts, workbench.test.ts, e2e night.spec.ts
- [x] apps/worker/src/online/night-park.docker.test.ts (провал ×2 → parked + въпрос → следващата тръгва → доклад)
- [ ] плъгин „Нощен доклад по имейл“ (изключен по подразбиране; чака SMTP — Q-055)
Готово, когато:
- [x] AC-4.4 (с паркиране) — docker тестът
- [ ] live: една истинска нощна смяна у Симо (чеклист 14)
