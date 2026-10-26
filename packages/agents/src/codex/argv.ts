// Демо промпт т. 8.3 (D-222): the exact argv of `codex exec` (@openai/codex 0.160.1). The -c keys are [НП] until the
// S-CX spike; the contract goes into the prompt (renderAgentContract), never through AGENTS.md (project_doc_max_bytes=0).
export interface CodexArgvOptions { model: string; prompt: string; /** D-392: a ChatGPT login — Codex's own provider, no proxy */ subscription?: boolean }

export function buildCodexArgv(o: CodexArgvOptions): string[] {
  return [
    "codex", "exec", "--json", "--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
    "-m", o.model, "-s", "workspace-write", "-C", "/m/work", "-o", "/m/out/notes.txt",
    ...(o.subscription
      ? []
      : [
          "-c", 'model_provider="mandat"',
          "-c", 'model_providers.mandat.name="mandat"',
          "-c", 'model_providers.mandat.base_url="http://egress-gate/v1"',
          "-c", 'model_providers.mandat.env_key="OPENAI_API_KEY"',
          "-c", 'model_providers.mandat.wire_api="responses"',
        ]),
    "-c", "project_doc_max_bytes=0",
    o.prompt,
  ];
}

/** CODEX_HOME on the sandbox tmpfs; the key env holds only the mdt_ token. */
export const CODEX_HOME = "/m/codex-home";
