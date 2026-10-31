import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    ".next-*/**",   // .next-build, .next-devcheck, .next-gate, .next-e2e-admin — збірки, не наш код
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
      // eslint-config-next 16.4 додав react-hooks/refs (читання ref під час рендера):
      // 3 місця з позиціонуванням дропдаунів / дзеркалом стану в ref — рефакторинг
      // окремо, поки попередження, як і решта експериментальних правил.
      "react-hooks/refs": "warn",

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
