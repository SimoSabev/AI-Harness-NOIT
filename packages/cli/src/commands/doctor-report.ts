// E7ж (v5 т. 3.7): `mandat doctor --report` — what Simo sends from macOS / Windows (WSL2) / Linux into docs/setup:
// the checks with their error codes and details without paths, the home directory, the user name or IP addresses.
export interface ReportCheck { name: string; ok: boolean; detail: string; info?: boolean }
export interface DoctorReport { os: string; arch: string; ok: boolean; checks: { name: string; ok: boolean; code: string | null; detail: string }[] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function anonymize(text: string, o: { home: string; user: string }): string {
  let s = text;
  if (o.home) s = s.split(o.home).join("<path>");
  s = s
    .replace(/[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*/g, "<path>")
    .replace(/(?<![\w<])(?:~|\/(?:home|Users|mnt|root|tmp|var|opt|private|Volumes))(?:\/[^\s)]*)?/g, "<path>")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>");
  if (o.user && o.user.length >= 2) s = s.replace(new RegExp(`\\b${esc(o.user)}\\b`, "g"), "<user>");
  return s.replace(/<path>(?:\/<path>)+/g, "<path>");
}

export function doctorReport(i: { platform: string; release: string; arch: string; checks: ReportCheck[]; home: string; user: string }): DoctorReport {
  const a = (t: string) => anonymize(t, { home: i.home, user: i.user });
  return {
    os: `${i.platform} ${i.release.split(".")[0] ?? i.release}`,
    arch: i.arch,
    ok: i.checks.every((c) => c.ok || c.info === true),
    checks: i.checks.map((c) => ({ name: c.name, ok: c.ok, code: /\bE_[A-Z_]+\b/.exec(c.detail)?.[0] ?? null, detail: a(c.detail).slice(0, 300) })),
  };
}
