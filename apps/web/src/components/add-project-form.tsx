"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AddProjectReply } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { postJson } from "../lib/client/api";
import { btn, card, input } from "./ui";

const ERR: Record<string, Key> = {
  not_a_folder: "add.err.not_a_folder",
  not_git: "add.err.not_git",
  no_commits: "add.err.no_commits",
  inside_home: "add.err.inside_home",
  failed: "add.err.failed",
  keys_unavailable: "add.err.unavailable",
  control_unavailable: "add.err.unavailable",
  bad_path: "add.err.bad_path",
};

// D-388: "Add project" in a browser — the full path of a git folder on this computer; `mandat local` makes Mandat's own
// mirror of it, adds the project and starts the rules scan. With `path` (the desktop app, after the folder was granted)
// it registers that folder at once.
export function AddProjectForm({ path: given }: { path?: string }) {
  const t = useT();
  const router = useRouter();
  const [path, setPath] = useState(given ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; created: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const add = async (p: string) => {
    setBusy(true);
    setErr(null);
    const r = await postJson("/api/repos", { path: p.trim() });
    setBusy(false);
    const reply = AddProjectReply.safeParse(r.body);
    if (r.status === 200 && reply.success && reply.data.ok) {
      setDone({ name: reply.data.full_name, created: reply.data.created });
      router.refresh();
      return;
    }
    const code = reply.success && !reply.data.ok ? reply.data.error : typeof r.body.error === "string" ? r.body.error : "failed";
    setErr(t(ERR[code] ?? "add.err.failed"));
  };
  const once = useRef(false);
  useEffect(() => {
    if (given && !once.current) {
      once.current = true;
      void add(given);
    }
  }, [given]);

  return (
    <section aria-labelledby="reg-h" className={`${card} mt-6 p-5`}>
      <h2 id="reg-h" className="sr-only">{t("add.title")}</h2>
      {!given && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => (e.preventDefault(), void add(path))}>
          <label className="min-w-0 flex-1">
            <span className="text-sm font-medium">{t("add.pathLabel")}</span>
            <input className={`${input} mt-1 font-mono`} value={path} onChange={(e) => setPath(e.target.value)} placeholder={t("add.pathPlaceholder")} spellCheck={false} autoComplete="off" required />
          </label>
          <button type="submit" className={btn.primary} disabled={busy || path.trim() === ""}>{busy ? t("add.registering") : t("add.register")}</button>
        </form>
      )}
      {given && busy && <p role="status" className="text-sm text-mute">{t("add.registering")}</p>}
      {done && (
        <div role="status" className="space-y-2 text-sm">
          <p className="text-ok">{t(done.created ? "add.done" : "add.exists", { name: done.name })}</p>
          <Link href="/harness" className={btn.secondary}>{t("add.openProjects")}</Link>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-bad">{err}</p>}
    </section>
  );
}
