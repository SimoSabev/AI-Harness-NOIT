import { describe, expect, it } from "vitest";
import { applyArgv, applyValue, editorUrl, isEditorUrl } from "./local-actions.js";

// E9g A3 (D-373): the two local edits — "Apply locally" runs `mandat --json apply` (merge --ff-only, never reset or
// checkout -f) and "Open in editor" opens an editor URL. Both are built here from already authorized real paths.
describe("Open in editor (D-373)", () => {
  it("vscode / cursor / zed URLs with the file and the line", () => {
    expect(editorUrl("vscode", "/w/shop/src/a.ts", 12, "linux")).toBe("vscode://file/w/shop/src/a.ts:12");
    expect(editorUrl("cursor", "/w/shop/src/a.ts", undefined, "darwin")).toBe("cursor://file/w/shop/src/a.ts");
    expect(editorUrl("zed", "/w/shop/src/a.ts", 3, "linux")).toBe("zed://file/w/shop/src/a.ts:3");
  });
  it("odd characters are encoded per segment, so # ? % or a space cannot change the URL", () => {
    expect(editorUrl("vscode", "/w/my shop/#1?x%.ts", 1, "linux")).toBe("vscode://file/w/my%20shop/%231%3Fx%25.ts:1");
  });
  it("Windows paths: forward slashes, the drive kept", () => {
    expect(editorUrl("vscode", "D:\\code\\shop\\a b.ts", 2, "win32")).toBe("vscode://file/D:/code/shop/a%20b.ts:2");
  });
  it("only the three editor schemes with a file path pass the final check", () => {
    expect(isEditorUrl("vscode://file/w/a.ts:1")).toBe(true);
    expect(isEditorUrl("zed://file/w/a.ts")).toBe(true);
    for (const bad of ["https://x.test/", "file:///etc/passwd", "vscode://ms-vscode.remote/x", "javascript:alert(1)", "cursor://file"]) expect(isEditorUrl(bad), bad).toBe(false);
  });
});

describe("Apply locally (D-373, D-356)", () => {
  it("the argv: the CLI's apply with --json, the task and the working copy — no shell, nothing else", () => {
    expect(applyArgv("/repo/packages/cli/dist/main.js", "t_42", "/w/shop")).toEqual(["/repo/packages/cli/dist/main.js", "--json", "apply", "--task", "t_42", "--repo", "/w/shop"]);
  });
  it("applied, up to date (nothing to bring) or refused with the CLI's reason", () => {
    const head = "a".repeat(40);
    expect(applyValue(0, JSON.stringify({ ok: true, ref: "mandat/t_42-a1", head, files: ["a.ts"] }) + "\n")).toEqual({ ok: true, value: { status: "applied", head } });
    expect(applyValue(0, JSON.stringify({ ok: true, ref: "mandat/t_42-a1", head, files: [] }))).toEqual({ ok: true, value: { status: "up_to_date", head } });
    expect(applyValue(3, "noise\n" + JSON.stringify({ ok: false, reason: "diverged", detail: "rebase first" }) + "\n")).toEqual({ ok: true, value: { status: "refused", head: null, detail: "diverged: rebase first" } });
    expect(applyValue(3, JSON.stringify({ ok: false, reason: "local_changes" }))).toEqual({ ok: true, value: { status: "refused", head: null, detail: "local_changes" } });
  });
  it("no JSON, a foreign shape or an exit code that contradicts it → failed, never a guess", () => {
    expect(applyValue(1, "Error: boom")).toEqual({ ok: false, error: { code: "failed", message: "mandat apply did not answer (exit 1)" } });
    expect(applyValue(0, JSON.stringify({ ok: "yes" }))).toMatchObject({ ok: false, error: { code: "failed" } });
    expect(applyValue(3, JSON.stringify({ ok: true, ref: "r", head: "a".repeat(40), files: [] }))).toMatchObject({ ok: false, error: { code: "failed" } });
  });
});
