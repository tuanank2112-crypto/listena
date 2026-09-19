import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["dataset/source/build_dataset.js", "scripts/build-dataset.cjs", "test_listenai.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // A leading underscore is how this codebase marks a binding it keeps on
    // purpose: a parameter a contract requires but the body must not read
    // (`_answer`, `_correctAnswer` — hidden answers), or a destructured field
    // pulled out only to drop it. Deleting them would change a signature or
    // leak what was deliberately discarded, so the rule ignores them instead.
    files: ["**/*.{js,jsx,ts,tsx,cjs,mjs}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        args: "after-used",
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "coverage/**",
    "src/generated/**",
    "next-env.d.ts",
    // Playwright writes a bundled HTML report and trace attachments here.
    // They are build output, not source, and they drown the real signal
    // (257 errors after one failing run).
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
