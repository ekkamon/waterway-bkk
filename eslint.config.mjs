import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // server.js is a plain CommonJS entry point outside the Next app (mirrors
  // Next's own generated .next/standalone/server.js, which also uses require()).
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "server.js"]),
]);
