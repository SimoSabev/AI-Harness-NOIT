import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "fixtures/**", ".mandat/**", "docs/spec/**", ".next/**", "**/.next/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: "readonly", self: "readonly", navigator: "readonly", window: "readonly", Notification: "readonly", atob: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", fetch: "readonly", AbortSignal: "readonly", Response: "readonly", Headers: "readonly", Request: "readonly", document: "readonly", localStorage: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": ["error", { selector: "ExportDefaultDeclaration", message: "Named exports only (AGENTS.md)." }],
    },
  },
  {
    // Next.js App Router (page/layout) and Playwright globalSetup require default exports (D-285)
    files: ["apps/web/src/app/**/page.tsx", "apps/web/src/app/**/layout.tsx", "apps/web/src/app/manifest.ts", "apps/web/e2e/global-setup.ts", "apps/web/demo-e2e/global-setup.ts", "apps/web/playwright.demo.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    files: ["**/*.config.ts", "**/*.config.js", "eslint.config.js"],
    rules: { "no-restricted-syntax": "off" },
  },
);
