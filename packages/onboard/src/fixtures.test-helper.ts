import type { RepoView } from "./scan.js";

// 6 scanner fixtures (т. 8.2): npm/pnpm × vitest/jest × with/without turbo, as in-memory trees.
export function memView(files: Record<string, string>): RepoView {
  return { files: Object.keys(files), read: (p) => files[p] ?? null };
}

const ci = (cmd: string, perms = true) =>
  `name: ci\non: [push, pull_request]\n${perms ? "permissions:\n  contents: read\n" : ""}jobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: ${cmd}\n  lint:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo lint\n`;

function repo(pm: "npm" | "pnpm", fw: "vitest" | "jest", turbo: boolean): Record<string, string> {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "x", scripts: { test: fw === "vitest" ? "vitest run" : "jest", lint: "eslint .", ...(turbo ? { build: "turbo run build" } : {}) }, devDependencies: { [fw]: "1.0.0" } }),
    [pm === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json"]: "lock",
    "src/cart.ts": "export {}",
    "tests/cart.spec.ts": "test",
    ".github/workflows/ci.yml": ci(pm === "pnpm" ? "pnpm test" : "npm test"),
    "README.md": "# x",
    ".nvmrc": "24.22.0\n",
  };
  if (turbo) {
    files["turbo.json"] = "{}";
    files["pnpm-workspace.yaml"] = "packages: ['packages/*']";
    files["packages/a/src/index.ts"] = "export {}";
  }
  if (fw === "vitest") files["vitest.config.ts"] = "export default {}";
  return files;
}

export const FIXTURES: Record<string, Record<string, string>> = {
  "npm-vitest": repo("npm", "vitest", false),
  "npm-jest": repo("npm", "jest", false),
  "pnpm-vitest": repo("pnpm", "vitest", false),
  "pnpm-jest": repo("pnpm", "jest", false),
  "pnpm-vitest-turbo": repo("pnpm", "vitest", true),
  "npm-jest-turbo": repo("npm", "jest", true),
};
export const ciYaml = ci;
