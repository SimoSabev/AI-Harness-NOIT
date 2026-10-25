# E8е — конфликти по файл, WIP лимит, rebase при изместен base (v5 т. 4.6)
- [x] apps/worker/src/online/coordination.test.ts (findConflicts; WIP лимит и чакане в claim; recordConflicts веднъж) — „conflict-detect“, „wip-limit“
- [x] apps/worker/src/online/daemon.test.ts › file conflicts (same_file wait → спрян, нов опит зад другата)
- [x] apps/worker/src/online/stream-to-workbench.test.ts › нов пипнат файл се пише веднага
- [x] apps/worker/src/online/conflict-wait.docker.test.ts (две fake задачи пипат src/cart.ts → втората след първата, с присъда)
- [x] apps/worker/src/online/rebase.test.ts (3-way: чисто / конфликт)
- [x] apps/worker/src/online/daemon.test.ts › moved base (чисто → опит rebase с нова присъда → PR; конфликт → HELD base_moved)
- [x] apps/worker/src/rebase.docker.test.ts (опит rebase без агент → VERIFIED)
Готово, когато:
- [x] AC-4.2 (карта „2 агента пипат…“ ≤ 5 s; при wait втората чака до края на първата)
- [x] AC-4.5 (изместен base → rebase + нова присъда; конфликт → HELD base_moved; никога force)
