// tests/editor/_alias-loader.mjs
//
// Node ESM loader hook used by the S03 content-boundary harness to
// resolve "@/" path aliases used throughout website2025's source
// modules. Activated via `node --import tests/editor/_alias-register.mjs`.

import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { resolve as pathResolve, dirname } from "node:path";
import { transformSync } from "esbuild";

// Resolve "@/" -> <repo>/src/. This is sufficient for the harness's
// direct module imports.
const REPO = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ALIAS_PREFIXES = ["@/", "@/lib/", "@/app/", "@/components/", "@/config/", "@/types/"];

export async function resolve(specifier, context, nextResolve) {
  // Map "@/..." -> "<repo>/src/..."
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    // Try with the .ts extension.
    const candidateTs = pathResolve(REPO, "src", rest);
    if (existsSync(candidateTs) && statSync(candidateTs).isFile()) {
      return nextResolve(pathToFileURL(candidateTs).href, context);
    }
    // Try the .tsx extension.
    const candidateTsx = pathResolve(REPO, "src", `${rest}.tsx`);
    if (existsSync(candidateTsx) && statSync(candidateTsx).isFile()) {
      return nextResolve(pathToFileURL(candidateTsx).href, context);
    }
    // Try as a directory index.ts.
    const candidateIndex = pathResolve(REPO, "src", rest, "index.ts");
    if (existsSync(candidateIndex) && statSync(candidateIndex).isFile()) {
      return nextResolve(pathToFileURL(candidateIndex).href, context);
    }
    return nextResolve(pathToFileURL(pathResolve(REPO, "src", rest)).href, context);
  }
  // Resolve ".ts" extensions to ".ts" files inside website2025.
  if (specifier.endsWith(".ts") || specifier.endsWith(".tsx")) {
    return nextResolve(specifier, context);
  }
  return nextResolve(specifier, context);
}