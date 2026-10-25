# Известни ограничения по сигурността (демо)

- Codex и AGENTS.md (т. 8.3, И6): argv-ът подава `-c project_doc_max_bytes=0`, за да не чете Codex AGENTS.md от дървото
  [Ф, codex-rs/core/src/agents_md.rs:68-71 @ 4e7b9e2]. Докато спайкът S-CX не го потвърди с маркер (docs/spikes/S-CX.md),
  приемаме, че агентът може да прочете AGENTS.md. Промяна на AGENTS.md от агента остава D3 → UNKNOWN, ниво ≤ 1.
- Codex `-s workspace-write` в Docker rootless е [НП]; изключване на собствения sandbox на Codex е позволено само вътре в
  пясъчника на Мандат и само след S-CX (D-288).
- Ключовете (Anthropic, OpenAI) са само в паметта на LLM проксито (E7в: не и в env; еднократен boot токен, D-345); на диска са запечатани с AES-256-GCM под KEK (D-313; границата D-055 „ключът е в env на проксито“ отпада). Агентът получава mdt_ токен, обвързан с един доставчик (claim p).
