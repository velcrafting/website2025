// tests/editor/_module-loader.mjs
//
// Test-only loader for Gate B. It compiles the REAL on-disk TypeScript of
// src/editor/** in memory (typescript.transpileModule, CommonJS) and evaluates
// it in a vm sandbox whose `require` resolves "@/"-aliased relative imports back
// through this same loader. Nothing is written and no export is added to a
// production file.
//
// This is separate from _transform.mjs (Gate A's page/route harness) so that the
// Gate A evidence files stay byte-identical.

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = pathResolve(HERE, "..", "..");
const nodeRequire = createRequire(import.meta.url);

function stripDirectives(source) {
  return source.replace(/^\s*(["']use (server|client)["'];?)\s*$/gm, "");
}

export function createModuleLoader(options = {}) {
  const env = options.env ?? {};
  const cwd = options.cwd ?? REPO;
  const stubs = options.stubs ?? {};
  const cache = new Map();

  function resolveRelative(spec, fromDir) {
    let base = null;
    if (spec.startsWith("@/")) base = pathResolve(REPO, "src", spec.slice(2));
    else if (spec.startsWith("./") || spec.startsWith("../")) base = pathResolve(fromDir, spec);
    if (base === null) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  function loadAbsolute(absPath) {
    const cached = cache.get(absPath);
    if (cached) return cached.exports;

    const source = stripDirectives(readFileSync(absPath, "utf8"));
    const transpiled = ts.transpileModule(source, {
      fileName: absPath,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: "react",
        esModuleInterop: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        resolveJsonModule: true,
        isolatedModules: true,
        strict: false,
        skipLibCheck: true,
      },
    }).outputText;

    const mod = { exports: {} };
    cache.set(absPath, mod);

    const sandbox = {
      module: mod,
      exports: mod.exports,
      __filename: absPath,
      __dirname: dirname(absPath),
      process: { cwd: () => cwd, env },
      Buffer,
      console,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      setTimeout,
      clearTimeout,
      setImmediate,
      clearImmediate,
      structuredClone,
      // Web globals the route handlers and the publisher rely on.
      Response,
      Request,
      Headers,
      FormData,
      AbortController,
      AbortSignal,
      fetch: options.fetchImpl ?? globalThis.fetch,
      globalThis: undefined,
    };
    sandbox.globalThis = sandbox;

    function sandboxRequire(spec) {
      if (Object.prototype.hasOwnProperty.call(stubs, spec)) {
        const stub = stubs[spec];
        return typeof stub === "function" ? stub({ env, cwd }) : stub;
      }
      if (spec.startsWith("node:")) return nodeRequire(spec);
      const resolved = resolveRelative(spec, dirname(absPath));
      if (resolved) return loadAbsolute(resolved);
      return nodeRequire(spec);
    }
    sandbox.require = sandboxRequire;

    const wrapper = vm.runInNewContext(
      `(function (exports, require, module, __filename, __dirname) {${transpiled}\n})`,
      sandbox,
    );
    wrapper(mod.exports, sandboxRequire, mod, absPath, dirname(absPath));
    return mod.exports;
  }

  return {
    /** Load a repo-relative path, e.g. "src/editor/repository/store.ts". */
    load: (relativePath) => loadAbsolute(pathResolve(REPO, relativePath)),
    loadAbsolute,
    cache,
    repo: REPO,
  };
}

// ---------------------------------------------------------------------------
// Minimal assertion + runner. Deliberately tiny: no framework is installed and
// Gate B is not authorized to add one.

let currentSuite = null;
const failures = [];
let passed = 0;

export function suite(name) {
  currentSuite = name;
  process.stdout.write(`\n${name}\n`);
}

export async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } catch (error) {
    failures.push({ suite: currentSuite, name, error });
    process.stdout.write(`  FAIL ${name}\n         ${error && error.message}\n`);
  }
}

export function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "assertEqual"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message || "assertDeepEqual"}:\n  expected ${b}\n  actual   ${a}`);
}

export async function assertRejects(fn, predicate, message) {
  let threw = false;
  let caught = null;
  try {
    await fn();
  } catch (error) {
    threw = true;
    caught = error;
  }
  if (!threw) throw new Error(`${message || "assertRejects"}: expected a throw, none happened`);
  if (predicate && !predicate(caught)) {
    throw new Error(
      `${message || "assertRejects"}: unexpected error ${caught.code ? `[${caught.code}] ` : ""}${caught.message}`,
    );
  }
  return caught;
}

export function expectCode(code) {
  return (error) => error && error.code === code;
}

export function finish(label) {
  process.stdout.write(`\n${label}: ${passed}/${passed + failures.length} passed\n`);
  if (failures.length) {
    process.stdout.write("\nfailures:\n");
    for (const f of failures) {
      process.stdout.write(`  [${f.suite}] ${f.name}\n    ${f.error && f.error.stack}\n`);
    }
    process.exitCode = 1;
  }
  return failures.length === 0;
}

// ---------------------------------------------------------------------------
// Fixture helpers. Every temporary root is removed on process exit so a test
// cannot leave state behind for the next run.

const tempRoots = [];
export function makeTempRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}
process.on("exit", () => {
  for (const root of tempRoots) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best effort: the OS cleans its own temp directory.
    }
  }
});
