import path from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../vitest.docker.config.js";

// D-389: the Docker tests bind-mount folders made with os.tmpdir(). On macOS that is /var/folders/…, which Colima (and a
// Docker Desktop without that share) does not mount into its VM — the gate then sees an empty folder and never loads its
// policy. The Docker tests get a TMPDIR inside the repo (under the user's home, which every macOS Docker shares).
const repoRoot = path.resolve(import.meta.dirname, "..");

describe("Docker tests' temporary folder (D-389)", () => {
  it("TMPDIR is <repo>/.mandat/tmp-docker unless MANDAT_DOCKER_TMP says otherwise", () => {
    const env = (config.test as { env?: Record<string, string> }).env ?? {};
    expect(env.TMPDIR).toBe(process.env.MANDAT_DOCKER_TMP ?? path.join(repoRoot, ".mandat", "tmp-docker"));
  });
});

// D-389: every image build sends the build context through the socket; the web and site builds (~770 MB on a Mac
// with them built) are not needed by any image, and a changed test report must not invalidate the cached install layer.
describe(".dockerignore keeps build outputs out of the context (D-389)", () => {
  it("the Next.js builds, the site export and downloads, test reports", async () => {
    const { readFileSync } = await import("node:fs");
    const lines = readFileSync(path.join(repoRoot, ".dockerignore"), "utf8").split("\n").map((l) => l.trim());
    for (const p of ["**/.next", "apps/site/out", "apps/site/public/downloads", "**/test-results"]) expect(lines, p).toContain(p);
  });
});
