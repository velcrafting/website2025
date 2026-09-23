// tests/editor/_transform.mjs
//
// Test-only transform harness for website2025 page actions.
//
// Strategy:
//   1. Read the page module's source text.
//   2. Strip the leading "use server" / "use client" directives (unused
//      here; not relied on).
//   3. Transpile with the installed `typescript` compiler API to CommonJS
//      with JSX preserved as `_jsx` calls (we replace React JSX with
//      `null` for the harness so we never construct DOM).
//   4. Evaluate the transpiled module in a `vm` context with a custom
//      `require` that:
//        - stubs `next/link`, `next/navigation`, `next/headers`,
//          `next/server`
//        - resolves `@/lib/admin` and `@/lib/content-paths` to the real
//          source (transpiled and executed in the same context)
//        - replaces `node:fs/promises` with a recording fake
//        - delegates everything else to the real `require`
//   5. Returns the `module.exports` so the caller can invoke the actual
//      server-action function directly.
//
// This harness does NOT add exports to production files. It operates on the
// on-disk source at test time.

import { readFileSync } from "node:fs";
import { dirname, resolve as pathResolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = pathResolve(HERE, "..", "..");
const nodeRequire = createRequire(import.meta.url);

// Recording fake for node:fs/promises. Captures every call so the test can
// assert zero effects when authorization is denied or sending is requested.
export function makeRecordingFs() {
  const calls = [];
  const mkdir = async (...args) => {
    calls.push({ op: "mkdir", args });
  };
  const writeFile = async (...args) => {
    calls.push({ op: "writeFile", args });
  };
  const unlink = async (...args) => {
    calls.push({ op: "unlink", args });
  };
  const readFile = async (...args) => {
    calls.push({ op: "readFile", args });
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  const readdir = async (...args) => {
    calls.push({ op: "readdir", args });
    return [];
  };
  const stat = async (...args) => {
    calls.push({ op: "stat", args });
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  const lstat = async (...args) => {
    calls.push({ op: "lstat", args });
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  const realpath = async (...args) => {
    calls.push({ op: "realpath", args });
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  };
  return { calls, mkdir, writeFile, unlink, readFile, readdir, stat, lstat, realpath };
}

// Recording redirect for next/navigation. The test inspects the last
// recorded target to confirm the action chose the expected route.
export function makeRecordingRedirect() {
  const targets = [];
  function redirect(target) {
    targets.push(target);
    const err = new Error("NEXT_REDIRECT:" + target);
    err.__redirect = target;
    throw err;
  }
  return { redirect, targets };
}

// Recording cookies() store for next/headers. Tests control ADMIN_KEY and
// the cookie value via this store.
export function makeRecordingCookies() {
  const store = new Map();
  const cookies = async () => ({
    get(name) {
      const v = store.get(name);
      return v === undefined ? undefined : { value: v };
    },
    set(name, value) {
      store.set(name, value);
    },
  });
  return { cookies, store };
}

// Transpile a source file to a CommonJS module string with JSX replaced by
// `null`. We only need the action functions to be reachable; we never run
// the JSX in the harness.
function transpileToCjs(source, filePath) {
  // Use TS's own JSX emit (react-jsx). The harness provides a stub React
  // runtime via the require shim so emitted `_jsx(...)` calls resolve.
  // We also strip "use server" / "use client" directive prologues so the
  // emitted CJS does not depend on Next.js's Babel pass.
  const stripped = source.replace(
    /^\s*(["']use (server|client)["'];?)\s*$/m,
    "",
  );

  const result = ts.transpileModule(stripped, {
    fileName: filePath,
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
  });
  if (result.diagnostics && result.diagnostics.length) {
    const msgs = result.diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
      .join("\n");
    throw new Error(`transpile failed: ${msgs}\n${filePath}`);
  }
  // Append test-only re-exports for any server-action functions that exist
  // as local declarations in the page module. We do NOT modify the source
  // file on disk; this is an in-memory transform that exposes the actions
  // for the harness to invoke directly. The body of each action is
  // unchanged from production.
  const actionNames = detectActionNames(source);
  let suffix = "";
  for (const name of actionNames) {
    suffix += `\nexports.${name} = ${name};`;
  }
  return result.outputText + suffix;
}

// Find async function declarations whose body starts with the literal
// string "use server" — these are Next.js server actions declared inside
// the page module.
function detectActionNames(source) {
  const names = [];
  const re = /async\s+function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{[^}]*["']use server["']/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    names.push(m[1]);
  }
  return names;
}

// Load a real helper module from src/lib via the same transform pipeline,
// but evaluated OUTSIDE the recording sandbox. The content-paths helper
// only reads (realpath, lstat, stat); it does not write, so passing the
// real `node:fs/promises` is safe and required so that realpath can
// resolve symlinks correctly inside the fixture root.
/**
 * Editor modules the harness loads for REAL in both the page and route loaders.
 *
 * They do no I/O — no database, no network — so stubbing them would let a validator or
 * renderer regression pass unnoticed, which is the thing these harnesses exist to catch.
 * Anything that opens a store is stubbed as a recorder instead, never listed here.
 */
const PURE_EDITOR_MODULES = [
  "@/editor/contracts/errors",
  "@/editor/validation/revision",
  "@/editor/forms/editor-form",
  "@/editor/render/bundle",
  "@/editor/render/issue-shell",
];

/**
 * Modules loaded through the helper loader are cached per load.
 *
 * Without this, every `loadHelper` call builds a FRESH copy of the module and of everything it
 * imports, so `store.ts` exists as several instances: `withTransaction` records its transaction in
 * one instance's active-set while `createItem` checks another's and refuses with "createItem must run
 * inside withTransaction()". A module graph must be a graph, not a pile of copies.
 */
const SHARED_HELPER_CACHE = new Map();

function loadHelperModule(helperRelPath, ctxRequire, cache = SHARED_HELPER_CACHE) {
  const abs = pathResolve(REPO, helperRelPath);
  const cached = cache.get(abs);
  if (cached) return cached.exports;
  const src = readFileSync(abs, "utf8");
  const cjs = transpileToCjs(src, abs);
  const mod = { exports: {} };
  // Cache BEFORE evaluating: this module's own imports are resolved during evaluation, and a module
  // that imports it back (store.ts is imported by both the service and the repositories) must find
  // THIS instance. Without this the graph holds several copies of store.ts, each with its own
  // active-transaction set, and a transaction opened on one is invisible to the other.
  cache.set(abs, mod);
  const sandboxRequire = (req) => {
    if (req === "node:fs/promises") return nodeRequire("node:fs/promises");
    if (req === "node:path") return nodeRequire("node:path");
    if (req.startsWith("@/lib/")) {
      throw new Error(`unexpected @/lib import from helper: ${req}`);
    }
    if (req.startsWith("node:")) return nodeRequire(req);
    // Resolve a relative import against the HELPER's own directory rather than this file's.
    // A pure helper such as the block validator has its own relative imports
    // (`../contracts/hash`); resolving those against tests/editor/ fails, and the tempting
    // workaround is to duplicate the helper's rules in a stub — which is precisely the drift
    // this harness exists to prevent. So the helper loads its own graph instead.
    if (req.startsWith("./") || req.startsWith("../")) {
      const fs = nodeRequire("node:fs");
      const base = pathResolve(dirname(abs), req);
      for (const candidate of [`${base}.ts`, `${base}.tsx`, base, pathResolve(base, "index.ts")]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return loadHelperModule(candidate.slice(REPO.length + 1), ctxRequire, cache);
        }
      }
      throw new Error(`helper ${helperRelPath} imports ${req}, which does not exist`);
    }
    return nodeRequire(req);
  };
  const sandbox = {
    module: undefined,
    exports: undefined,
    require: undefined,
    __filename: abs,
    __dirname: dirname(abs),
    process: { cwd: () => ctxRequire.cwd, env: ctxRequire.env ?? {} },
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
    globalThis: undefined,
  };
  sandbox.globalThis = sandbox;
  sandbox.require = sandboxRequire;
  const fn = vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) {${cjs}\n})`,
    sandbox,
  );
  fn(mod.exports, sandboxRequire, mod, abs, dirname(abs));
  return mod.exports;
}

// Load a CMS route handler module (Next.js Route Handler). Unlike page
// modules, route handlers perform real filesystem effects. The harness
// passes the real `node:fs/promises` (no recording fake) so the test can
// read back saved content from the temp fixture. The cookie/admin-key
// state is controlled by env and the supplied x-agent-key header. The
// returned module exposes POST/PUT/DELETE/GET functions that accept a
// fabricated `NextRequest`.
export function loadRouteModule(routeRelPath, options = {}) {
  const abs = pathResolve(REPO, routeRelPath);
  const src = readFileSync(abs, "utf8");
  const cjs = transpileToCjs(src, abs);

  const cookieStore = options.cookieStore ?? new Map();
  const cwd = options.cwd ?? "/";
  const env = options.env ?? {};
  const realRequire = nodeRequire;

  const sandbox = {
    module: undefined,
    exports: undefined,
    require: undefined,
    __filename: abs,
    __dirname: dirname(abs),
    process: { cwd: () => cwd, env },
    Buffer,
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    // The fetch API a route handler is written against: a route receives a Request and returns
    // a Response, so a sandbox without these can only test routes that avoid the platform.
    Request,
    Response,
    Headers,
    FormData,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    globalThis: undefined,
  };
  sandbox.globalThis = sandbox;

  function sandboxRequire(req) {
    if (req === "node:fs/promises") return nodeRequire("node:fs/promises");
    if (req === "node:path") return nodeRequire("node:path");
    if (req === "next/headers") {
      return {
        cookies: async () => ({
          get: (n) => {
            const v = cookieStore.get(n);
            return v === undefined ? undefined : { value: v };
          },
          set: (n, v) => cookieStore.set(n, v),
        }),
      };
    }
    if (req === "next/server") {
      class NextResponse {
        constructor(body, init) {
          this.body = body;
          this.status = init?.status ?? 200;
          this.headers = init?.headers ?? {};
        }
        static json(obj, init) {
          return new NextResponse(JSON.stringify(obj), {
            ...init,
            headers: { "content-type": "application/json", ...(init?.headers || {}) },
          });
        }
        async json() {
          return JSON.parse(this.body);
        }
      }
      class NextRequest {
        constructor(url, init) {
          this.url = url;
          this.headers = new Map();
          this._body = init?.body;
          if (init?.headers)
            for (const [k, v] of Object.entries(init.headers))
              this.headers.set(k.toLowerCase(), v);
        }
        async json() {
          return JSON.parse(this._body || "{}");
        }
      }
      return { NextResponse, NextRequest };
    }
    if (req === "@/lib/admin") {
      // The session gate, stubbed exactly as the page loader stubs it: the test controls
      // ADMIN_KEY through options.env and the session cookie through cookieStore, so an
      // unauthorized route call is a real path here rather than a mock of one.
      const envKey = env.ADMIN_KEY;
      const authorized = () => Boolean(envKey) && cookieStore.get("admin") === envKey;
      return {
        __esModule: true,
        isAdmin: async () => authorized(),
        requireAdmin: async () => {
          if (!authorized()) {
            const err = new Error("Unauthorized");
            err.__unauthorized = true;
            throw err;
          }
        },
      };
    }
    if (PURE_EDITOR_MODULES.includes(req)) {
      // A preview route renders; it must never be handed a stubbed validator or renderer.
      return loadHelperModule(`src/${req.slice(2)}.ts`, { cwd, env });
    }
    if (req.startsWith("@/editor/")) {
      throw new Error(
        `unexpected @/editor import from a route: ${req}. Add it to PURE_EDITOR_MODULES ` +
          `deliberately if it does no I/O; if it opens a database, stub it as a recorder.`,
      );
    }
    if (req.startsWith("@/lib/")) {
      // Inline load: any @/lib/* import resolves to the real source.
      const rel = req.slice(2);
      // Avoid recursive sandbox setup; we use the helper loader for
      // content-paths.ts (the only @/lib/* the route uses).
      if (rel.startsWith("lib/content-paths")) {
        return loadHelperModule("src/" + rel + ".ts", { cwd, env });
      }
      throw new Error(`unexpected @/lib import from route: ${req}`);
    }
    return realRequire(req);
  }

  sandbox.require = sandboxRequire;
  const mod = { exports: {} };
  const fn = vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) {${cjs}\n})`,
    sandbox,
  );
  fn(mod.exports, sandboxRequire, mod, abs, dirname(abs));
  return { exports: mod.exports, cookieStore };
}
export function loadPageModule(pageRelPath, options = {}) {
  const abs = pathResolve(REPO, pageRelPath);
  const src = readFileSync(abs, "utf8");
  const cjs = transpileToCjs(src, abs);

  const fsImpl = options.fsImpl ?? makeRecordingFs();
  const path = options.path ?? nodeRequire("node:path");
  const realRequire = options.realRequire ?? nodeRequire;
  const authBehavior = options.authBehavior ?? "allow";
  // `cookieStore` is shared with the test so it can simulate ADMIN_KEY
  // being absent / present.
  const cookieStore = options.cookieStore ?? new Map();
  const contentRoot = options.contentRoot;
  const cwd = options.cwd ?? "/";

  const recordedRedirects = [];
  function redirect(target) {
    recordedRedirects.push(target);
    const err = new Error("NEXT_REDIRECT:" + target);
    err.__redirect = target;
    throw err;
  }

  const sandbox = {
    module: undefined,
    exports: undefined,
    require: undefined,
    __filename: abs,
    __dirname: dirname(abs),
    process: { cwd: () => cwd, env: options.env ?? {} },
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
    globalThis: undefined,
  };
  sandbox.globalThis = sandbox;

  const helperExports = {};
  // One module graph per page load: every helper-loaded module shares this cache, so the store
  // instance that opens a transaction is the same instance that checks for one.
  const helperCache = new Map();
  // Records what the capture page did to the revision store, so a test can assert that a
  // capture reached the store — and that a denied or invalid request never did.
  const editorCapture = options.editorCapture ?? { opened: 0, closed: 0, issues: [] };
  function loadHelper(rel) {
    return loadHelperModule(rel, {
      require: realRequire,
      cwd,
      env: options.env ?? {},
    }, helperCache);
  }

  function sandboxRequire(req) {
    if (req === "node:fs/promises") return fsImpl;
    if (req === "node:path") return path;
    if (req === "next/link") return { default: () => null };
    if (req === "next/navigation") return { redirect };
    if (req === "next/headers") {
      return {
        cookies: async () => ({
          get: (n) => {
            const v = cookieStore.get(n);
            return v === undefined ? undefined : { value: v };
          },
          set: (n, v) => cookieStore.set(n, v),
        }),
      };
    }
    if (req === "next/server") {
      return {
        NextResponse: class {
          constructor(body, init) {
            this.body = body;
            this.status = init?.status ?? 200;
            this.headers = init?.headers ?? {};
          }
          static json(obj, init) {
            return new this(JSON.stringify(obj), {
              ...init,
              headers: { "content-type": "application/json", ...(init?.headers || {}) },
            });
          }
          async json() {
            return JSON.parse(this.body);
          }
        },
        NextRequest: class {
          constructor(url, init) {
            this.url = url;
            this.headers = new Map();
            this._body = init?.body;
            if (init?.headers)
              for (const [k, v] of Object.entries(init.headers))
                this.headers.set(k.toLowerCase(), v);
          }
          async json() {
            return JSON.parse(this._body || "{}");
          }
        },
      };
    }
    if (req.startsWith("@/components/")) {
      // Presentation only. These tests exercise authorization, path validation and
      // side effects; they never render. Each stub is an EXPLICIT entry: an unknown
      // @/components import FAILS rather than being silently stubbed, so a new module
      // dependency is noticed instead of hidden (CODEX_REFRESH_REVIEW.md finding 4).
      //
      // Extend this set deliberately, and only for a pure presentational module.
      const PRESENTATION_STUBS = {
        "@/components/layout/Workspace": ["default", "WorkspaceProse"],
        // Editor presentational pieces: a server-action test never renders them, but the page module
        // imports them, so they must be named here rather than left to fail closed.
        "@/components/editor/BlockPicker": ["default"],
        "@/components/editor/BlockKindFields": ["default"],
        "@/components/editor/UnsavedDraftGuard": ["default"],
        "@/components/editor/UnsavedPreview": ["default"],
        "@/components/editor/PrepareAnotherDraft": ["default"],
      };
      const names = PRESENTATION_STUBS[req];
      if (!names) {
        throw new Error(
          `unexpected @/components import from a mutating module: ${req}. ` +
            `Add it to PRESENTATION_STUBS in tests/editor/_transform.mjs only if it is ` +
            `a pure presentational module; otherwise the harness cannot load the real one.`
        );
      }
      const module = { __esModule: true };
      for (const name of names) {
        const Component = () => null;
        Component.displayName = name === "default" ? "Stub" : name;
        module[name] = Component;
      }
      return module;
    }
    if (req === "@/lib/admin") {
      // Stub admin: throws unless cookie matches ADMIN_KEY and ADMIN_KEY is
      // set. Tests control ADMIN_KEY via options.env.ADMIN_KEY and the
      // cookie value via cookieStore.
      const envKey = (options.env ?? {}).ADMIN_KEY;
      return {
        __esModule: true,
        isAdmin: async () => {
          if (!envKey) return false;
          const c = cookieStore.get("admin");
          return Boolean(c && c === envKey);
        },
        requireAdmin: async () => {
          const ok = await (async () => {
            if (!envKey) return false;
            const c = cookieStore.get("admin");
            return Boolean(c && c === envKey);
          })();
          if (!ok) {
            const err = new Error("Unauthorized");
            err.__unauthorized = true;
            throw err;
          }
        },
      };
    }
    if (req === "@/lib/content-paths") {
      // Reuse the real helper so integration is honest. It uses
      // node:fs/promises via our fsImpl.
      if (!helperExports.contentPaths) {
        helperExports.contentPaths = loadHelper(
          "src/lib/content-paths.ts",
        );
      }
      return helperExports.contentPaths;
    }
    if (req.startsWith("@/editor/")) {
      // The capture page writes into the revision store now rather than straight to a content
      // file, so the harness has to distinguish the pure parts of the editor from the parts
      // that touch sqlite.
      //
      // `contracts/errors` and `validation/revision` do no I/O, so the REAL modules load. A
      // stubbed validator would let a path-guard regression pass unnoticed, which is exactly
      // what this harness exists to catch. Everything that opens a database is replaced by a
      // recorder instead, so no test can touch a real store.
      if (req === "@/editor/approval/service" || req === "@/editor/publishing/website") {
        // Imported by the page for its approve and publish actions, which these tests do not
        // exercise. They THROW rather than return quietly: authority is asserted from the database
        // (no approval or intent rows), so a stub that pretended to work would be worse than none.
        return {
          __esModule: true,
          approveRevision: () => {
            throw new Error("approveRevision is not stubbed in this harness");
          },
          commitWebsitePublication: () => {
            throw new Error("commitWebsitePublication is not stubbed in this harness");
          },
          verifyWebsitePublication: async () => {
            throw new Error("verifyWebsitePublication is not stubbed in this harness");
          },
        };
      }
      if (req === "@/editor/repository/public") {
        // A read-only projection used while RENDERING the page, which these action tests do not do.
        return {
          __esModule: true,
          listProvenanceForRevision: () => [],
          accessLevelLabel: (level) => String(level),
        };
      }
      if (req === "@/editor/admin-guard") {
        // The page's editor-session guard. The harness tests authorization where it actually lives
        // for an action — `@/lib/admin`'s requireAdmin, stubbed faithfully above — so this guard is
        // a no-op here rather than a second, weaker gate the test would mistake for the real one.
        return { __esModule: true, requireEditorSession: async () => undefined };
      }
      if (PURE_EDITOR_MODULES.includes(req)) {
        if (!helperExports[req]) helperExports[req] = loadHelper(`src/${req.slice(2)}.ts`);
        return helperExports[req];
      }
      if (req === "@/editor/repository/store") {
        if (options.realStore) {
          // Fail closed: a real-store run MUST carry an explicit database path. Without it the store
          // falls back to a default path, and a test must never be safe merely because no database
          // happens to exist there.
          if (!(options.env ?? {}).EDITOR_DB_PATH) {
            throw new Error(
              "realStore requires an explicit EDITOR_DB_PATH in options.env; refusing to fall back " +
                "to a default database.",
            );
          }
          // A test that drives a real action against a real (temporary) database opts in
          // explicitly, so the action's effects are observable rather than recorded.
          if (!helperExports.realStore) {
            helperExports.realStore = loadHelper("src/editor/repository/store.ts");
          }
          return helperExports.realStore;
        }
        return {
          __esModule: true,
          openEditorStore: () => {
            editorCapture.opened += 1;
            return {
              db: null,
              path: ":memory:",
              migrationsApplied: [],
              close() {
                editorCapture.closed += 1;
              },
            };
          },
        };
      }
      if (req === "@/editor/revision/service") {
        if (options.realStore) {
          if (!helperExports.realService) {
            helperExports.realService = loadHelper("src/editor/revision/service.ts");
          }
          return helperExports.realService;
        }
        return {
          __esModule: true,
          createIssue: (store, input) => {
            editorCapture.issues.push(input);
            return { item: { id: "item_captured" }, revision: {}, bundle: {} };
          },
        };
      }
      if (req === "@/editor/service") {
        if (options.realStore) {
          // Real graph: the page needs `withEditorStore` (and the human subject) from this module,
          // so a one-function stub would leave the action calling undefined.
          if (!helperExports.realEditorService) {
            helperExports.realEditorService = loadHelper("src/editor/service.ts");
          }
          return helperExports.realEditorService;
        }
        return { __esModule: true, currentHumanSubject: () => "human_test_subject" };
      }
      if (options.realStore) {
        // "Real graph" mode: a test that opted into a real temporary database also gets the real
        // editor modules, so an action runs against real repositories rather than recorders. The
        // deliberately-unexercised stubs above still win, so nothing silently becomes real that the
        // test is not asserting against.
        const key = `real:${req}`;
        if (!helperExports[key]) helperExports[key] = loadHelper(`src/${req.slice(2)}.ts`);
        return helperExports[key];
      }
      throw new Error(
        `unexpected @/editor import from a mutating module: ${req}. Extend this block ` +
          `deliberately; if the module opens a database, stub it as a recorder.`,
      );
    }
    if (req === "next/cache") {
      // A server action may revalidate a path; the harness records it rather than requiring a
      // request context, so an action's effect on the store is what the test can see.
      return { __esModule: true, revalidatePath: () => undefined, revalidateTag: () => undefined };
    }
    if (req === "react" || req === "react/jsx-runtime") {
      return {
        __esModule: true,
        jsx: (type, props, key) => ({ type, props: props || {}, key }),
        jsxs: (type, props, key) => ({ type, props: props || {}, key }),
        Fragment: ({ children } = {}) => ({ type: "Fragment", props: { children } }),
      };
    }
    // Fall through to the real require for anything else.
    return realRequire(req);
  }

  const mod = { exports: {} };
  // Install sandbox.require BEFORE running the wrapper so that the
  // CommonJS code emitted by transpileModule can resolve its require()
  // calls against our controlled loader.
  sandbox.require = sandboxRequire;
  const fn = vm.runInNewContext(
    `(function (exports, require, module, __filename, __dirname) {${cjs}\n})`,
    sandbox,
  );
  // Patch process.cwd via the sandbox so the action uses the test's
  // fixture root.
  sandbox.process = { cwd: () => cwd, env: options.env ?? {} };
  fn(mod.exports, sandboxRequire, mod, abs, dirname(abs));

  // If the caller supplied a contentRoot override, the action computes
  // paths via `path.join(process.cwd(), "src", "content", ...)` and via
  // resolveSafeContentPath(root, ...). The harness overrides process.cwd
  // via the sandbox above; ensure that path resolves to the fixture
  // content directory.

  return {
    exports: mod.exports,
    fsImpl,
    recordedRedirects,
    cookieStore,
    helperExports,
    editorCapture,
  };
}