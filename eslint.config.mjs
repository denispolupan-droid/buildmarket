import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
  ]),
  {
    rules: {
      // react-hooks v5 added this rule but it produces many false positives
      // for legitimate patterns (localStorage init, route-change resets, debounce guards)
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
