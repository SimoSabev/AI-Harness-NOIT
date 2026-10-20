import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "fixtures/**", ".mandat/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly", fetch: "readonly", AbortSignal: "readonly", Response: "readonly", Headers: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": ["error", { selector: "ExportDefaultDeclaration", message: "Named exports only (AGENTS.md)." }],
    },
  },
  {
    files: ["**/*.config.ts", "**/*.config.js", "eslint.config.js"],
    rules: { "no-restricted-syntax": "off" },
  },
);
