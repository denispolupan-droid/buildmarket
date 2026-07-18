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
    ".claude/**",   // тимчасові git-worktrees агентів — не наш код
  ]),
  {
    rules: {
      // react-hooks v5 added this rule but it produces many false positives
      // for legitimate patterns (localStorage init, route-change resets, debounce guards)
      "react-hooks/set-state-in-effect": "off",

      // Експериментальні правила react-hooks v6 — шумні / вимагають рефакторингу без
      // реальної користі; тримаємо як попередження, а не блокер CI.
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",

      // Прагматичні послаблення (нетипізований supabase-клієнт, косметика) — попередження.
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "@next/next/no-html-link-for-pages": "warn",

      // Залишаємо ПОМИЛКАМИ (ловлять реальні баги):
      //   react-hooks/rules-of-hooks — умовний виклик хуків
      //   prefer-const — незмінна змінна оголошена через let
    },
  },
]);

export default eslintConfig;
