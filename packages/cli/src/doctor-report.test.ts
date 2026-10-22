import { describe, expect, it } from "vitest";
import { anonymize, doctorReport } from "./commands/doctor-report.js";

describe("doctor --report (E7ж): an anonymous report for docs/setup", () => {
  it("paths, the home directory, the user name and IPs are removed", () => {
    const o = { home: "/Users/simo", user: "simo" };
    expect(anonymize("E_UNSUPPORTED_FS: /mnt/c/Users/simo/code/ai-harness", o)).toBe("E_UNSUPPORTED_FS: <path>");
    expect(anonymize("C:\\Users\\simo\\x run by simo at 192.168.1.20", o)).toBe("<path> run by <user> at <ip>");
    expect(anonymize("mandat-sandbox:cc2.1.302-95af810a830e", o)).toBe("mandat-sandbox:cc2.1.302-95af810a830e");
    expect(anonymize("running, healthz ok (127.0.0.1:8788)", o)).toBe("running, healthz ok (<ip>:8788)");
  });
  it("the report: os, arch, the checks with their error code and an anonymous detail; no home or user anywhere", () => {
    const r = doctorReport({
      platform: "darwin", release: "24.1.0", arch: "arm64",
      checks: [
        { name: "node", ok: true, detail: "24.22.0" },
        { name: "filesystem", ok: false, detail: "E_UNSUPPORTED_FS: клонирай в WSL файловата система (~/) /home/simo/x" },
      ],
      home: "/home/simo", user: "simo",
    });
    expect(r).toMatchObject({ os: "darwin 24", arch: "arm64", ok: false, checks: [{ name: "node", ok: true, code: null }, { name: "filesystem", ok: false, code: "E_UNSUPPORTED_FS" }] });
    expect(JSON.stringify(r)).not.toContain("simo");
  });
});
