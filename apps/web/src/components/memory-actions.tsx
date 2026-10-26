"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MemoryItem, MemoryKind } from "@mandat/contract";
import { useT } from "../i18n/client";
import type { Key } from "../i18n/t";
import { errorText, postJson } from "../lib/client/api";
import { btn, input } from "./ui";

// D-400: changing memory from the menu — add, edit, approve/reject, archive/restore, pin, delete, tidy up. The server
// runs every text through the same scanner as an agent's write; its refusals come back as plain sentences.
const KINDS: MemoryKind[] = ["preference", "convention", "command", "pitfall", "fact", "note", "episode"];
const ERR: Record<string, Key> = {
  memory_rule: "mem.err.memory_rule",
  memory_secret: "mem.err.memory_secret",
  memory_injection: "mem.err.memory_injection",
  memory_invisible: "mem.err.memory_invisible",
  memory_duplicate: "mem.err.memory_duplicate",
  memory_no_repo: "mem.err.memory_no_repo",
  bad_state: "mem.err.bad_state",
  no_capability: "mem.err.no_capability",
};
type Msg = { text: string; error: boolean } | null;
const Note = ({ msg }: { msg: Msg }) => (msg ? <p role="status" className={`text-sm ${msg.error ? "text-bad" : "text-ok"}`}>{msg.text}</p> : null);

export function AddMemory({ repos, canProject }: { repos: { id: string; name: string }[]; canProject: boolean }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [scope, setScope] = useState<"user" | "project">("user");
  const [repo, setRepo] = useState(repos[0]?.id ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const save = async () => {
    setMsg(null);
    const r = await postJson("/api/memory", { text, kind, scope, ...(scope === "project" ? { repo_id: repo } : {}) });
    if (r.status >= 300) return setMsg({ text: errorText(t, r, ERR), error: true });
    const replaced = Array.isArray(r.body.superseded) ? r.body.superseded.length : 0;
    setMsg({ text: replaced > 0 ? t("mem.add.replaced", { n: replaced }) : t("mem.add.saved"), error: false });
    setText("");
    router.refresh();
  };
  return (
    <form className="space-y-2" onSubmit={(e) => (e.preventDefault(), void save())}>
      <label className="block text-sm">
        <span className="sr-only">{t("mem.add.text")}</span>
        <textarea className={`${input} min-h-16`} maxLength={500} placeholder={t("mem.add.text")} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-mute">
          {t("mem.add.kind")}
          <select className={`${input} mt-1 w-40`} value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{t(`mem.kind.${k}`)}</option>)}
          </select>
        </label>
        <label className="text-xs text-mute">
          {t("mem.add.scope")}
          <select className={`${input} mt-1 w-36`} value={scope} onChange={(e) => setScope(e.target.value as "user" | "project")}>
            <option value="user">{t("mem.scope.user")}</option>
            {canProject && repos.length > 0 && <option value="project">{t("mem.scope.project")}</option>}
          </select>
        </label>
        {scope === "project" && (
          <label className="text-xs text-mute">
            {t("mem.project")}
            <select className={`${input} mt-1 w-48`} value={repo} onChange={(e) => setRepo(e.target.value)}>
              {repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <button type="submit" className={btn.primary} disabled={text.trim().length < 3}>{t("mem.add.save")}</button>
      </div>
      <Note msg={msg} />
    </form>
  );
}

export function MemoryEditor({ item, canEdit, after }: { item: MemoryItem; canEdit: boolean; after: string }) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState<MemoryKind>(item.kind);
  const [msg, setMsg] = useState<Msg>(null);
  const call = async (body: Record<string, unknown>, method: "PATCH" | "DELETE" = "PATCH") => {
    setMsg(null);
    const r = await postJson(`/api/memory/${item.id}`, body, method);
    if (r.status >= 300) return setMsg({ text: errorText(t, r, ERR), error: true });
    if (method === "DELETE") router.push(after);
    else router.refresh();
  };
  if (!canEdit) return null;
  const changed = text.trim() !== item.text || kind !== item.kind;
  return (
    <div className="space-y-3">
      <textarea className={`${input} min-h-20`} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} aria-label={t("mem.add.text")} />
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${input} w-40`} value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} aria-label={t("mem.add.kind")}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`mem.kind.${k}`)}</option>)}
        </select>
        <button type="button" className={btn.primary} disabled={!changed || text.trim().length < 3} onClick={() => void call({ action: "edit", text: text.trim(), kind })}>{t("mem.act.save")}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {item.status === "pending" && <button type="button" className={btn.primary} onClick={() => void call({ action: "approve" })}>{t("mem.act.approve")}</button>}
        {item.status === "pending" && <button type="button" className={btn.secondary} onClick={() => void call({ action: "reject" })}>{t("mem.act.reject")}</button>}
        {item.status === "active" && <button type="button" className={btn.secondary} onClick={() => void call({ action: "pin", pinned: !item.pinned })}>{t(item.pinned ? "mem.act.unpin" : "mem.act.pin")}</button>}
        {(item.status === "active" || item.status === "pending") && <button type="button" className={btn.secondary} onClick={() => void call({ action: "archive" })}>{t("mem.act.archive")}</button>}
        {(item.status === "archived" || item.status === "invalid" || item.status === "rejected") && <button type="button" className={btn.secondary} onClick={() => void call({ action: "restore" })}>{t("mem.act.restore")}</button>}
        <button type="button" className={btn.danger} onClick={() => (window.confirm(t("mem.act.deleteConfirm")) ? void call({}, "DELETE") : undefined)}>{t("mem.act.delete")}</button>
      </div>
      <Note msg={msg} />
    </div>
  );
}

export function TidyMemory() {
  const router = useRouter();
  const t = useT();
  const [msg, setMsg] = useState<Msg>(null);
  const tidy = async () => {
    setMsg(null);
    const r = await postJson("/api/memory/consolidate", {});
    if (r.status >= 300) return setMsg({ text: errorText(t, r, ERR), error: true });
    setMsg({ text: t("mem.tidy.done", { merged: Number(r.body.merged ?? 0), superseded: Number(r.body.superseded ?? 0), stale: Array.isArray(r.body.stale) ? r.body.stale.length : 0 }), error: false });
    router.refresh();
  };
  return (
    <span className="flex items-center gap-3">
      <button type="button" className={btn.secondary} onClick={() => void tidy()}>{t("mem.act.tidy")}</button>
      <Note msg={msg} />
    </span>
  );
}
