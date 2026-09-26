// `next build` with output: "standalone" does not copy public/ or .next/static.
// Copy them so .next/standalone is a self-contained folder that can be deployed as-is.
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("[postbuild] .next/standalone not found — is output: 'standalone' set?");
  process.exit(1);
}

// Runtime snapshots must never ship inside the build (Next traces the data dir).
rmSync(path.join(standalone, "data"), { recursive: true, force: true });

cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
console.log("[postbuild] copied public/ and .next/static into .next/standalone");
