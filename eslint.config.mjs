import tseslint from "typescript-eslint";
const config = tseslint.config(
  { ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts"] },
  ...tseslint.configs.recommended,
);
export default config;
