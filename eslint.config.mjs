import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Our data-loading effects intentionally call setState via async callbacks — not a real cascade
      "react-hooks/set-state-in-effect": "off",
      // Supabase's dynamic API returns untyped data extensively
      "@typescript-eslint/no-explicit-any": "off",
      // Local SQLite dev fallback uses require() for conditional loading
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
