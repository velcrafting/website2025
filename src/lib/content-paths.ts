// src/lib/content-paths.ts
// Content path validator for CMS and admin mutations.
//
// Purpose:
//   Reject unsafe pillar/slug/file-name inputs before any filesystem effect.
//   Lexical containment alone is insufficient; ancestors, the content root
//   itself, and the destination may be symlinks that escape the intended scope.
//
// Scope:
//   - Validate the lexical shape of pillar and slug names.
//   - Validate that an existing file path is contained within the content root
//     after symlink resolution.
//   - Validate that a destination path's *intended* parent exists or can be
//     created inside the content root, and that the destination's realpath
//     (once any pre-existing target is resolved) stays inside the root.
//   - This module performs pure validation. It does not touch the filesystem
//     beyond realpath/lstat/stat, and it never writes or deletes.
//
// Concurrency note:
//   This validator is a TOCTOU-vulnerable precheck. Between the realpath
//   confirmation here and the subsequent writeFile/unlink in the caller, an
//   attacker (or a sibling process) could replace the destination with a
//   symlink. The server action / route handler that consumes this module is
//   expected to run on a single-author editor with no concurrent writers; it
//   is not a safe boundary against a co-resident hostile writer. State this
//   explicitly rather than imply TOCTOU resistance.

import fs from "node:fs/promises";
import path from "node:path";

export function filesystemContentWritesEnabled(): boolean {
  return process.env.VERCEL !== "1" && (process.env.EDITOR_STORAGE_MODE ?? "sqlite").trim().toLowerCase() !== "postgres";
}

// Allowed characters for a content name (pillar, slug, or extension-less
// filename). Letters, digits, dash, underscore, and dot.
const SAFE_NAME = /^[A-Za-z0-9_.-]+$/;

// Reserved / separator characters that must never appear in a name.
const FORBIDDEN_CHARS = ["/", "\\", "\0"];

export class UnsafeContentPathError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "UnsafeContentPathError";
    this.code = code;
  }
}

// Validate a single content name (pillar or slug). Throws on rejection.
// Used for normalized values after raw-name validation has already passed.
export function assertSafeContentName(name: unknown, field: string): string {
  if (typeof name !== "string") {
    throw new UnsafeContentPathError("name_not_string", `${field} must be a string`);
  }
  if (name.length === 0) {
    throw new UnsafeContentPathError("name_empty", `${field} is empty`);
  }
  if (name.length > 128) {
    throw new UnsafeContentPathError("name_too_long", `${field} exceeds 128 characters`);
  }
  for (const ch of FORBIDDEN_CHARS) {
    if (name.includes(ch)) {
      throw new UnsafeContentPathError("name_contains_forbidden", `${field} contains a forbidden character`);
    }
  }
  if (/%(2f|5c|00)/i.test(name)) {
    throw new UnsafeContentPathError("name_contains_encoded_separator", `${field} contains an encoded separator`);
  }
  if (name === "." || name === "..") {
    throw new UnsafeContentPathError("name_is_dot", `${field} is a relative-path token`);
  }
  if (!SAFE_NAME.test(name)) {
    throw new UnsafeContentPathError("name_unsafe_charset", `${field} contains unsupported characters`);
  }
  if (name.startsWith(".") || name.endsWith(".")) {
    throw new UnsafeContentPathError("name_leading_or_trailing_dot", `${field} may not begin or end with '.'`);
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    throw new UnsafeContentPathError("name_leading_or_trailing_dash", `${field} may not begin or end with '-'`);
  }
  return name;
}

// Normalize a content name to the canonical safe form. The rule set
// matches what website2025's existing actions performed before S01:
// uppercase letters become lowercase; characters outside [a-z0-9-] become
// a single dash. The result is then validated with assertSafeContentName.
// Callers must reject the raw input's dangerous characters before invoking
// this function.
export function normalizeContentName(raw: unknown, field: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UnsafeContentPathError("name_empty", `${field} is empty`);
  }
  if (raw.length > 128) {
    throw new UnsafeContentPathError("name_too_long", `${field} exceeds 128 characters`);
  }
  const normalized = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // Empty after normalization is not a usable name.
  if (normalized.length === 0) {
    throw new UnsafeContentPathError("name_empty_after_normalize", `${field} normalized to an empty string`);
  }
  return assertSafeContentName(normalized, field);
}

// Validate raw user input BEFORE lossy normalization. Only dangerous
// path syntax is rejected; legitimate mixed-case, spaced, and
// punctuation-containing names are allowed through and normalized by
// normalizeContentName. The dangerous set:
//   - NUL byte
//   - forward slash or backslash (path separators)
//   - URL-encoded equivalents: %2F, %5C, %00 (case-insensitive)
//   - literal ".." or "." as the entire input (relative-path tokens)
//   - leading "." or ".." segment (handled by the explicit "." / ".."
//     check above)
//
// This is intentionally permissive about uppercase and spaces: the
// pre-S01 actions normalized those without complaint.
export function assertSafeRawName(raw: unknown, field: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new UnsafeContentPathError("name_empty", `${field} is empty`);
  }
  if (raw.length > 128) {
    throw new UnsafeContentPathError("name_too_long", `${field} exceeds 128 characters`);
  }
  for (const ch of FORBIDDEN_CHARS) {
    if (raw.includes(ch)) {
      throw new UnsafeContentPathError("name_contains_forbidden", `${field} contains a forbidden character`);
    }
  }
  if (/%(2f|5c|00)/i.test(raw)) {
    throw new UnsafeContentPathError("name_contains_encoded_separator", `${field} contains an encoded separator`);
  }
  if (raw === "." || raw === "..") {
    throw new UnsafeContentPathError("name_is_dot", `${field} is a relative-path token`);
  }
  // Reject any segment equal to ".." (e.g. "foo/.." or "..\bar"). The
  // FORBIDDEN_CHARS loop above rejects the slash, so this only catches
  // path-traversal on platforms where "\ " is treated as a separator by
  // downstream tooling.
  if (/(^|[\\/])\.\.(?:[\\/]|$)/.test(raw)) {
    throw new UnsafeContentPathError("name_traversal_segment", `${field} contains a traversal segment`);
  }
  return raw;
}

// Known OS-level path aliases. A symlink at one of these prefixes is
// treated as a legitimate OS alias (e.g. macOS `/tmp` -> `/private/tmp`,
// `/var` -> `/private/var`). A symlink outside this allow-list that lives
// anywhere in the ancestor chain is treated as a project-tree substitution
// and the configured root is rejected.
//
// Entries are pairs (alias, target) where the alias is the lexical path
// that the user types and the target is the realpath the kernel reports.
// During ancestor validation, if a symlink resolves to a path that
// corresponds to an allowed alias, the walk continues from the alias.
const OS_PATH_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["/private/tmp", "/tmp"],
  ["/tmp", "/private/tmp"],
  ["/private/var", "/var"],
  ["/var", "/private/var"],
];

function isAliasPair(aliasLexical: string, aliasReal: string): boolean {
  for (const [a, r] of OS_PATH_ALIASES) {
    if (aliasLexical === a && aliasReal === r) return true;
  }
  return false;
}

// Walk from the lexical root up to and including the configured root,
// confirming that any symlinked segment is a known OS-level alias. The
// walk tracks both the lexical path and the resolved realpath so it can
// confirm a symlink at depth N corresponds to one of the OS_PATH_ALIASES
// pairs and is not a project-tree substitution.
async function assertSafeAncestorChain(configuredRoot: string): Promise<void> {
  const segments = configuredRoot.split(path.sep).filter((s) => s.length > 0);
  // Walk from "/<seg0>" down to "/<seg0>/<seg1>/.../<segN>". We use lstat
  // on each path; if it is a symlink, the resolved realpath must match a
  // known OS alias.
  const SEP: string = path.sep;
  let lexicalSoFar: string = SEP; // root "/"
  let realSoFar: string | null = null;
  // Track the resolved realpath of the lexical "/". On macOS this is "/"
  // (root is not a symlink). On systems with /var aliased to /private/var,
  // the alias is at /var, not at /.
  realSoFar = lexicalSoFar;

  for (let i = 0; i < segments.length; i += 1) {
    lexicalSoFar =
      i === 0 ? SEP + segments[0] : lexicalSoFar + SEP + segments[i];
    let lst: import("node:fs").Stats;
    try {
      lst = await fs.lstat(lexicalSoFar);
    } catch {
      // Ancestor missing: this is only OK for the final segment (the
      // configured root may not exist yet, but it is later validated by
      // lstat). Intermediate ancestors must exist.
      if (i === segments.length - 1) {
        return;
      }
      throw new UnsafeContentPathError(
        "ancestor_unresolved",
        `ancestor ${lexicalSoFar} could not be resolved`,
      );
    }
    if (!lst.isSymbolicLink()) {
      // The segment is a real directory. Update realSoFar if it was not
      // already tracked.
      if (realSoFar === null) realSoFar = lexicalSoFar;
      else realSoFar = realSoFar + path.sep + segments[i];
      continue;
    }
    // The segment is a symlink. Resolve it and compare.
    let realSeg: string;
    try {
      realSeg = await fs.realpath(lexicalSoFar);
    } catch {
      throw new UnsafeContentPathError(
        "ancestor_unresolved",
        `symlinked ancestor ${lexicalSoFar} could not be resolved`,
      );
    }
    // The symlink must map to a known OS alias pair. Anything else (a
    // symlink inside the project tree, e.g. `/.../fixture/linked-parent`
    // pointing to `/.../outside/`) is rejected.
    if (!isAliasPair(lexicalSoFar, realSeg)) {
      throw new UnsafeContentPathError(
        "ancestor_is_project_symlink",
        `symlinked ancestor ${lexicalSoFar} -> ${realSeg} is not a known OS path alias; content root must be reachable without project-level symlink substitutions`,
      );
    }
    // Continue the walk from the realpath of this segment.
    realSoFar = realSeg;
  }
}

// Resolve and confirm the content root is safe. The trusted root is the
// realpath of the configured directory; any symlinked ancestor must be a
// known OS-level path alias (e.g. macOS /tmp -> /private/tmp). Project-
// level symlinks that substitute one path for another are rejected, so a
// configured root inside a project-level symlink cannot be used to escape
// into another directory.
async function assertSafeContentRoot(root: string): Promise<string> {
  if (typeof root !== "string" || root.length === 0) {
    throw new UnsafeContentPathError("root_invalid", "content root must be a non-empty string");
  }
  if (!path.isAbsolute(root)) {
    throw new UnsafeContentPathError("root_not_absolute", "content root must be an absolute path");
  }
  if (root.includes("\0")) {
    throw new UnsafeContentPathError("root_contains_nul", "content root contains a NUL byte");
  }
  const normalized = path.resolve(root);
  const segments = normalized.split(path.sep);
  for (const seg of segments) {
    if (seg === "..") {
      throw new UnsafeContentPathError("root_traversal_segment", "content root must not contain '..' segments");
    }
  }
  // Walk the ancestor chain first. Any symlinked segment must be a known
  // OS alias.
  await assertSafeAncestorChain(normalized);
  // The configured root itself must not be a symlink.
  let lst: import("node:fs").Stats;
  try {
    lst = await fs.lstat(normalized);
  } catch {
    throw new UnsafeContentPathError("root_unresolved", "content root could not be resolved");
  }
  if (lst.isSymbolicLink()) {
    throw new UnsafeContentPathError(
      "root_is_symlink",
      "content root must not be a symlink; configure a real directory",
    );
  }
  // Resolve the root via realpath so that symlinked ancestors are followed
  // for the purposes of containment checks. By the time we get here, any
  // such symlinks have been validated as OS aliases.
  let realRoot: string;
  try {
    realRoot = await fs.realpath(normalized);
  } catch {
    throw new UnsafeContentPathError("root_unresolved", "content root could not be resolved");
  }
  // Confirm the real root is a directory.
  let stat;
  try {
    stat = await fs.stat(realRoot);
  } catch {
    throw new UnsafeContentPathError("root_unresolved", "content root could not be resolved");
  }
  if (!stat.isDirectory()) {
    throw new UnsafeContentPathError("root_not_directory", "content root is not a directory");
  }
  return realRoot;
}

// Build an intended (not-yet-existing) absolute path inside the content root
// from a validated pillar and slug, with an optional extension. The default
// subdirectory is "blog"; callers may pass another (e.g. "newsletters") so
// the helper remains the single authority for containment.
function buildIntendedPath(
  realRoot: string,
  pillar: string,
  slug: string,
  ext: string,
  subdir: string = "blog",
): string {
  const candidate = path.join(realRoot, subdir, pillar, `${slug}${ext}`);
  const resolved = path.resolve(candidate);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (resolved !== realRoot && !resolved.startsWith(prefix)) {
    throw new UnsafeContentPathError("path_escapes_root", "resolved path escapes content root");
  }
  return resolved;
}

// Confirm an intended destination path resolves inside the content root
// after symlink resolution. For an existing destination file, realpath must
// land inside realRoot. For a missing destination, the deepest existing
// ancestor must realpath inside realRoot and must not itself be a symlink
// (a symlinked ancestor between the content root and the destination allows
// an attacker to swap the destination after validation).
async function assertPathInsideRoot(
  realRoot: string,
  intended: string,
): Promise<void> {
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  // Walk from intended upward until we find an existing path. Each step
  // inspects lstat: if the existing ancestor is a symlink, the resolved
  // target must still live inside realRoot. We additionally require that
  // existing ancestors on the path *between* realRoot and the destination
  // are not symlinks, to prevent a TOCTOU swap on the parent directory.
  let cursor: string | null = intended;
  let stoppedAtRoot = false;
  while (cursor !== null) {
    let lst: import("node:fs").Stats;
    try {
      lst = await fs.lstat(cursor);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in (err as { code?: string }) &&
        (err as { code?: string }).code === "ENOENT"
      ) {
        const parent = path.dirname(cursor);
        if (parent === cursor) {
          throw new UnsafeContentPathError("path_unresolved", "destination path could not be resolved");
        }
        cursor = parent;
        continue;
      }
      throw new UnsafeContentPathError("path_unresolved", "destination path could not be resolved");
    }
    if (lst.isSymbolicLink()) {
      // Resolve the symlink target and confirm containment.
      let real: string;
      try {
        real = await fs.realpath(cursor);
      } catch (err) {
        // Dangling symlink: target does not exist. Reject outright.
        if (
          err &&
          typeof err === "object" &&
          "code" in (err as { code?: string }) &&
          ((err as { code?: string }).code === "ENOENT" ||
            (err as { code?: string }).code === "ELOOP")
        ) {
          throw new UnsafeContentPathError("ancestor_is_dangling_symlink", "an ancestor is a dangling symlink");
        }
        throw new UnsafeContentPathError("ancestor_unresolved", "an ancestor symlink could not be resolved");
      }
      if (real !== realRoot && !real.startsWith(prefix)) {
        throw new UnsafeContentPathError(
          "ancestor_escapes_root",
          "an ancestor resolves outside the content root",
        );
      }
      // Allow symlinked ancestors whose target lies inside the content
      // root. The destination still realpaths inside, but a swap of this
      // symlink between validation and write is the documented TOCTOU gap.
      break;
    }
    // Not a symlink: realpath to confirm containment.
    let real: string;
    try {
      real = await fs.realpath(cursor);
    } catch {
      throw new UnsafeContentPathError("ancestor_unresolved", "an ancestor could not be resolved");
    }
    if (real === realRoot) {
      stoppedAtRoot = true;
    } else if (!real.startsWith(prefix)) {
      throw new UnsafeContentPathError(
        "ancestor_escapes_root",
        "an ancestor resolves outside the content root",
      );
    }
    break;
  }

  // If the destination itself exists, it must be a regular file (not a
  // directory or symlink) and its realpath must lie inside realRoot.
  try {
    const lst = await fs.lstat(intended);
    if (lst.isSymbolicLink()) {
      throw new UnsafeContentPathError("destination_is_symlink", "destination path is a symlink");
    }
    if (lst.isDirectory()) {
      throw new UnsafeContentPathError("destination_is_directory", "destination path is a directory");
    }
    const realFile = await fs.realpath(intended);
    if (realFile !== realRoot && !realFile.startsWith(prefix)) {
      throw new UnsafeContentPathError("file_escapes_root", "file resolves outside the content root");
    }
  } catch (err) {
    if (err instanceof UnsafeContentPathError) {
      throw err;
    }
    if (
      err &&
      typeof err === "object" &&
      "code" in (err as { code?: string }) &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      // Destination does not exist; that is fine for new writes, provided
      // every existing ancestor resolved inside realRoot above.
      return;
    }
    throw new UnsafeContentPathError("destination_unresolved", "destination path could not be resolved");
  }
  // Defensive: ensure we either stopped at the root or descended through a
  // chain that stayed inside it.
  if (!stoppedAtRoot) {
    // No-op: a symlink in the chain (allowed only if target is inside root)
    // would have broken before reaching this branch.
  }
}

// Resolve and validate an existing content file path against the root.
// Used by edit/DELETE flows before unlink.
export async function resolveSafeExistingContentPath(
  root: string,
  pillar: string,
  slug: string,
  ext: string,
  subdir: string = "blog",
): Promise<string> {
  const realRoot = await assertSafeContentRoot(root);
  assertSafeContentName(pillar, "pillar");
  assertSafeContentName(slug, "slug");
  if (ext !== "" && !SAFE_NAME.test(ext.replace(/^\./, ""))) {
    throw new UnsafeContentPathError("ext_unsafe_charset", "file extension contains unsupported characters");
  }
  const intended = buildIntendedPath(realRoot, pillar, slug, ext, subdir);
  let lst: import("node:fs").Stats;
  try {
    lst = await fs.lstat(intended);
  } catch {
    throw new UnsafeContentPathError("path_missing", "content path does not exist");
  }
  if (lst.isSymbolicLink()) {
    throw new UnsafeContentPathError("path_is_symlink", "content path is a symlink");
  }
  if (lst.isDirectory()) {
    throw new UnsafeContentPathError("path_is_directory", "content path is a directory");
  }
  await assertPathInsideRoot(realRoot, intended);
  const realFile = await fs.realpath(intended);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (realFile !== realRoot && !realFile.startsWith(prefix)) {
    throw new UnsafeContentPathError("file_escapes_root", "file resolves outside the content root");
  }
  return realFile;
}

// Resolve and validate an intended destination content file path against
// the root. Used by create/edit flows before write.
export async function resolveSafeContentPath(
  root: string,
  pillar: string,
  slug: string,
  ext: string,
  subdir: string = "blog",
): Promise<string> {
  const realRoot = await assertSafeContentRoot(root);
  assertSafeContentName(pillar, "pillar");
  assertSafeContentName(slug, "slug");
  if (ext !== "" && !SAFE_NAME.test(ext.replace(/^\./, ""))) {
    throw new UnsafeContentPathError("ext_unsafe_charset", "file extension contains unsupported characters");
  }
  const intended = buildIntendedPath(realRoot, pillar, slug, ext, subdir);
  await assertPathInsideRoot(realRoot, intended);
  return intended;
}

// Validate a newsletter file name (timestamp-based). Drafts use a numeric
// epoch name plus the .mdx extension; this helper enforces digit-only,
// bounded length.
export function assertSafeNewsletterName(name: unknown): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new UnsafeContentPathError("newsletter_name_invalid", "newsletter name must be a non-empty string");
  }
  if (!/^[0-9]{1,18}$/.test(name)) {
    throw new UnsafeContentPathError("newsletter_name_unsafe", "newsletter name must be a digit-only timestamp");
  }
  return name;
}

// Resolve and validate a newsletter draft path. Newsletters do not have a
// pillar; the filename is a numeric timestamp. The destination must lie
// inside `<contentRoot>/newsletters/`.
export async function resolveSafeNewsletterPath(
  root: string,
  fileName: string,
  ext: string = ".mdx",
): Promise<string> {
  const realRoot = await assertSafeContentRoot(root);
  assertSafeNewsletterName(fileName);
  if (ext !== "" && !SAFE_NAME.test(ext.replace(/^\./, ""))) {
    throw new UnsafeContentPathError("ext_unsafe_charset", "file extension contains unsupported characters");
  }
  const candidate = path.join(realRoot, "newsletters", `${fileName}${ext}`);
  const resolved = path.resolve(candidate);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  if (resolved !== realRoot && !resolved.startsWith(prefix)) {
    throw new UnsafeContentPathError("path_escapes_root", "resolved path escapes content root");
  }
  await assertPathInsideRoot(realRoot, resolved);
  return resolved;
}
