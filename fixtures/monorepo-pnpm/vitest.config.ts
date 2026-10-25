import { defineConfig } from "vitest/config";

// E8и: one run over every workspace package, one JSON report
export default defineConfig({
  test: {
    include: ["packages/*/tests/**/*.spec.ts"],
  },
});
