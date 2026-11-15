// D-525: the demo project (seeded by `pnpm local` before D-525, and with the demo switch after it) is not offered in the
// task box unless the demo switch is on (MANDAT_DEMO_AGENTS=1), so a real install shows only its own projects.
export const DEMO_PROJECT_ID = "d0000000-0000-4000-8000-0000000000b1";

export function taskProjects<P extends { id: string }>(projects: readonly P[], demo: boolean): P[] {
  return demo ? [...projects] : projects.filter((p) => p.id !== DEMO_PROJECT_ID);
}
