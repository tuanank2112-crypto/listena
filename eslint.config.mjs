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
