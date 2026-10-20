import { describe, expect, it } from "vitest";
import { plan, readmeWith } from "./set-core-license.mjs";

const pj = (license: string) => JSON.stringify({ name: "@mandat/core", license }, null, 2) + "\n";

describe("set-core-license (т. 4.2)", () => {
  it("dual: license + ред в README; apache: обратно", () => {
    const dual = plan("dual", [{ dir: "packages/core", packageJson: pj("Apache-2.0"), readme: null }]);
    expect(dual.map((c) => c.file)).toEqual(["packages/core/package.json", "packages/core/README.md"]);
    expect(JSON.parse(dual[0]?.after ?? "{}")).toMatchObject({ license: "Apache-2.0 OR GPL-3.0-or-later" });
    expect(dual[1]?.after).toContain("Apache-2.0 OR GPL-3.0-or-later");
    const back = plan("apache", [{ dir: "packages/core", packageJson: dual[0]?.after ?? "", readme: dual[1]?.after ?? "" }]);
    expect(JSON.parse(back[0]?.after ?? "{}")).toMatchObject({ license: "Apache-2.0" });
    expect(back[1]?.after).toBe("");
  });
  it("идемпотентно; README с текст запазва текста", () => {
    expect(plan("apache", [{ dir: "d", packageJson: pj("Apache-2.0"), readme: "# x\n" }])).toEqual([]);
    const once = readmeWith("# x\n", "dual");
    expect(once.startsWith("# x\n\n<!-- mandat-license:begin -->")).toBe(true);
    expect(readmeWith(once, "dual")).toBe(once);
    expect(readmeWith(once, "apache")).toBe("# x\n\n");
  });
  it("невалиден mode", () => {
    expect(() => plan("gpl" as "apache", [])).toThrow(/apache or dual/);
  });
});
