import { describe, expect, it } from "vitest";
import { chatItems, lastReply, liveStatusOf, toolIcon, usageOf, whyOf } from "./chat";

const L = (seq: number, kind: string, text: string, at = `2026-10-23T10:00:${String(seq).padStart(2, "0")}Z`) => ({ seq, kind, text, at });

describe("chatItems: потокът на агента → чат", () => {
  it("текст, извикване и резултат се сдвояват по име", () => {
    const items = chatItems([
      L(0, "init", "claude-code 2.1.302"),
      L(1, "text", "Ще погледна количката."),
      L(2, "tool_call", "Read: src/cart.ts"),
      L(3, "tool_result", "Read [allowed]: 42 lines"),
      L(4, "tool_call", "Bash: npx vitest run"),
    ]);
    expect(items).toEqual([
      { kind: "say", seq: 1, at: "2026-10-23T10:00:01Z", text: "Ще погледна количката." },
      { kind: "tool", seq: 2, at: "2026-10-23T10:00:02Z", name: "Read", summary: "src/cart.ts", state: "ok", output: "42 lines" },
      { kind: "tool", seq: 4, at: "2026-10-23T10:00:04Z", name: "Bash", summary: "npx vitest run", state: "run", output: null },
    ]);
  });
  it("последователният текст се слива в една реплика", () => {
    const items = chatItems([L(1, "text", "Първо"), L(2, "step", "второ")]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "say", text: "Първо\nвторо" });
  });
  it("отказ и грешка", () => {
    const items = chatItems([
      L(1, "tool_call", "Bash: git push"),
      L(2, "permission", "Bash [denied]"),
      L(3, "tool_call", "Edit: src/a.ts"),
      L(4, "tool_result", "Edit [error]: no such file"),
    ]);
    expect(items.map((i) => (i.kind === "tool" ? i.state : i.kind))).toEqual(["denied", "error"]);
  });
  it("резултат, подагенти; usage и unparsed не са в чата", () => {
    const items = chatItems([L(1, "subagent_start", "explore"), L(2, "usage", "tokens in 10 · out 2"), L(3, "unparsed", "{"), L(4, "subagent_stop", "explore"), L(5, "result", "failed: budget")]);
    expect(items.map((i) => i.kind)).toEqual(["sub", "sub", "end"]);
    expect(items[2]).toMatchObject({ kind: "end", ok: false, text: "budget" });
    expect(chatItems([L(1, "result", "done")])[0]).toMatchObject({ kind: "end", ok: true, text: "" });
  });
  it("резюмето е без повторено име и без работната папка на пясъчника", () => {
    const items = chatItems([L(1, "tool_call", "Read: Read /m/work/src/cart.ts"), L(2, "tool_call", "Bash: cd /m/work; npx vitest run 2>&1 | tail -15"), L(3, "tool_call", "Edit: Edit /m/work/src/a.ts"), L(4, "tool_call", "Bash: cd /m/work && ls")]);
    expect(items.map((i) => (i.kind === "tool" ? i.summary : ""))).toEqual(["src/cart.ts", "npx vitest run 2>&1 | tail -15", "src/a.ts", "ls"]);
  });
  it("инструмент без резюме", () => {
    expect(chatItems([L(1, "tool_call", "TodoWrite")])[0]).toMatchObject({ name: "TodoWrite", summary: "" });
  });
  it("насочванията на човека се вплитат по време", () => {
    const items = chatItems([L(1, "text", "а"), L(3, "text", "б")], [{ text: "ползвай Math.round", at: "2026-10-23T10:00:02Z" }]);
    expect(items.map((i) => i.kind)).toEqual(["say", "steer", "say"]);
  });
});

describe("usageOf", () => {
  it("последният ред с токени", () => {
    expect(usageOf([L(1, "usage", "tokens in 10 · out 2"), L(2, "usage", "tokens in 1200 · out 340 · $0.0123")])).toEqual({ input: 1200, output: 340, usd: 0.0123 });
    expect(usageOf([L(1, "usage", "tokens in 5 · out 1")])).toEqual({ input: 5, output: 1, usd: null });
    expect(usageOf([])).toBeNull();
  });
});

describe("toolIcon", () => {
  it("познати инструменти и резерва", () => {
    expect(toolIcon("Read")).toBe("read");
    expect(toolIcon("Edit")).toBe("edit");
    expect(toolIcon("MultiEdit")).toBe("edit");
    expect(toolIcon("Write")).toBe("edit");
    expect(toolIcon("Bash")).toBe("run");
    expect(toolIcon("Grep")).toBe("search");
    expect(toolIcon("Glob")).toBe("search");
    expect(toolIcon("mcp__mandat__mandat_verify")).toBe("plug");
    expect(toolIcon("Whatever")).toBe("tool");
  });
});

describe("whyOf: защо Мандат пита (D-367)", () => {
  it("кодове → ключ на текста и пътя", () => {
    expect(whyOf("sensitive:deps:package.json, deleted:src/a.ts, too_big:420, not_verified")).toEqual([
      { key: "why.sensitive.deps", path: "package.json", n: null },
      { key: "why.deleted", path: "src/a.ts", n: null },
      { key: "why.too_big", path: null, n: 420 },
      { key: "why.not_verified", path: null, n: null },
    ]);
    expect(whyOf("apply_failed:not_fast_forward")).toEqual([{ key: "why.apply_failed", path: null, n: null }]);
    expect(whyOf("night, external, renamed:b.ts, too_many_files:20, empty")).toEqual([
      { key: "why.night", path: null, n: null }, { key: "why.external", path: null, n: null }, { key: "why.renamed", path: "b.ts", n: null },
      { key: "why.too_many_files", path: null, n: 20 }, { key: "why.empty", path: null, n: null },
    ]);
  });
  it("непознат код → общият текст", () => {
    expect(whyOf("weird:thing")).toEqual([{ key: "why.other", path: null, n: null }]);
    expect(whyOf("")).toEqual([]);
  });
});

describe("what the run is doing now (D-446)", () => {
  const at = "2026-11-02T08:00:00.000Z";
  const l = (seq: number, kind: string, text: string) => ({ seq, kind, text, at });
  it("no lines yet: nothing to say", () => {
    expect(liveStatusOf([])).toEqual({ phase: null, notice: null });
  });
  it("the last phase counts; a code outside the set is ignored", () => {
    expect(liveStatusOf([l(0, "phase", "provision"), l(1, "phase", "install"), l(2, "phase", "telepathy")]).phase).toBe("install");
  });
  it("a provider notice lasts until the model answers or the phase moves on", () => {
    const n = { problem: "overloaded", attempt: 4, max: 10 };
    const base = [l(0, "phase", "agent"), l(1, "provider", "overloaded 4/10")];
    expect(liveStatusOf(base).notice).toEqual(n);
    expect(liveStatusOf([...base, l(2, "usage", "tokens in 1 · out 1")]).notice).toEqual(n);
    expect(liveStatusOf([...base, l(2, "text", "hello")]).notice).toBeNull();
    expect(liveStatusOf([...base, l(2, "tool_call", "Read")]).notice).toBeNull();
    expect(liveStatusOf([...base, l(2, "phase", "export")]).notice).toBeNull();
  });
  it("free text on a provider line is not a notice, and an agent's text is not a phase", () => {
    expect(liveStatusOf([l(0, "provider", "Google says: secret")]).notice).toBeNull();
    expect(liveStatusOf([l(0, "text", "provision"), l(1, "step", "verify")]).phase).toBeNull();
  });
  it("the chat itself does not show these lines", () => {
    expect(chatItems([l(0, "phase", "agent"), l(1, "provider", "overloaded 4/10")])).toEqual([]);
  });
});

describe("the reply a person came for (D-448)", () => {
  const L2 = (seq: number, kind: string, text: string) => ({ seq, kind, text, at: "2026-11-02T08:00:00.000Z" });
  it("the agent's last words, without tools and status lines", () => {
    expect(lastReply(chatItems([L2(0, "phase", "agent"), L2(1, "text", "Let me look."), L2(2, "tool_call", "Read: a.ts"), L2(3, "text", "Hello!"), L2(4, "result", "done"), L2(5, "phase", "export")]))).toBe("Hello!");
  });
  it("no reply: null", () => {
    expect(lastReply(chatItems([L2(0, "phase", "agent"), L2(1, "result", "failed: x")]))).toBeNull();
  });
});
