import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "cypress/**"],
  },
  {
    // Repo-wide conventions & legacy baseline (ported Vue/JS codebase):
    // - `any` is used deliberately throughout the engine/port layers
    // - react-hooks v7 rules (set-state-in-effect, refs, immutability) fire on
    //   the pre-existing ported components — out of scope for this branch
    // - JSX entities & CJS seed scripts are intentional
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
      // Legacy: random chart colors generated during render (compare page)
      "react-hooks/purity": "off",
      "react/no-unescaped-entities": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
