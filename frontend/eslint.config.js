// ESLint flat config (docs/0062).
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-bench", "coverage", "src/api/schema.d.ts"] },
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
    // Hebrew is right-to-left (docs/0087): use logical classes (ms-/me-/ps-/pe-/start-/end-,
    // border-s/e, rounded-s/e, text-start/end) so layouts mirror. The floor-plan drawing never
    // mirrors, but it is SVG geometry, not Tailwind classes.
    files: ["src/**/*.tsx", "src/**/*.ts"],
    ignores: ["src/**/*.test.ts", "src/**/*.test.tsx"], // prose like "right-to-left"
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(^|[ :])-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right)-/]",
          message:
            "Physical left/right class: use the logical one (ms-, me-, ps-, pe-, start-, end-, border-s, rounded-s, text-start) so Hebrew mirrors (docs/0087).",
        },
        {
          selector: "Literal[value=/(^|[ :])(text-left|text-right|float-left|float-right)( |$)/]",
          message: "Use text-start/text-end so Hebrew mirrors (docs/0087).",
        },
      ],
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
