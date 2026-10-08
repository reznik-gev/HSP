// ESLint flat config (docs/0062).
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-bench", "src/api/schema.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // The editor core must stay renderer-agnostic: no React, DOM or SVG view code (docs/0052).
    files: ["src/editor/core/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "The editor core is headless (docs/0052). Move React code to the view layer.",
            },
            {
              group: ["**/view-svg/**", "@/components/**", "@/routes/**"],
              message: "The editor core must not depend on view code (docs/0052).",
            },
          ],
        },
      ],
      "no-restricted-globals": ["error", "document", "window", "navigator"],
    },
  },
  {
    files: ["*.config.js", "*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // Plain JS (this config) is not part of the TS project: lint it without type information.
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
