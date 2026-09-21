// src/lib/content.ts
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import type { Doc, Frontmatter } from "@/types/content";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const EXTS = new Set([".md", ".mdx"]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (EXTS.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

function toSlug(fullPath: string, kind: "projects" | "blog" | "labs"): string {
  const rel = path.relative(path.join(CONTENT_ROOT, kind), fullPath);
  const noExt = rel.replace(path.extname(rel), "");
  return noExt.split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Metadata readers with an explicit third state.
//
// Absence and invalidity are different facts and must not collapse into each
// other. Treating a present-but-wrong-typed value as "absent" is exactly how
// the coercer erased an explicit `status: 123` and let the predicate infer
// publication from a legacy date (GATE_A_REPAIR_REVIEW finding 1).
type FieldState<T> =
  | { state: "absent" }
  | { state: "valid"; value: T }
  | { state: "invalid" };

const KNOWN_STATUS = new Set(["published", "scheduled", "draft"]);

function hasOwn(source: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function readStatusField(source: Record<string, unknown>): FieldState<string> {
  if (!hasOwn(source, "status")) return { state: "absent" };
  const v = source.status;
  if (v === undefined || v === null) return { state: "absent" };
  if (typeof v === "string" && KNOWN_STATUS.has(v)) return { state: "valid", value: v };
  // Present but not one of the three known values, including wrong types.
  return { state: "invalid" };
}

// Parse a date-ish value to epoch ms without ever throwing. `new Date(NaN)`
// has a `toISOString` that throws a RangeError, so validity is checked before
// any serialisation, and the whole read is guarded.
function parseDateValue(value: unknown): number | undefined {
  try {
    if (typeof value === "string") {
      const t = Date.parse(value);
      return Number.isNaN(t) ? undefined : t;
    }
    if (value instanceof Date) {
      const t = value.getTime();
      return Number.isNaN(t) ? undefined : t;
    }
    if (typeof value === "object" && value !== null) {
      // Cross-realm Date (a YAML loader in another realm produces one).
      const maybe = value as { getTime?: unknown };
      if (typeof maybe.getTime === "function") {
        const t = (maybe.getTime as () => number).call(value);
        return Number.isNaN(t) ? undefined : t;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readDateField(source: Record<string, unknown>, key: string): FieldState<string> {
  if (!hasOwn(source, key)) return { state: "absent" };
  const v = source[key];
  if (v === undefined || v === null) return { state: "absent" };
  const ms = parseDateValue(v);
  if (ms === undefined) return { state: "invalid" };
  return { state: "valid", value: new Date(ms).toISOString() };
}

function coerceFrontmatter(data: unknown): Frontmatter {
  const d = (data ?? {}) as Record<string, unknown>;
  const dateField = readDateField(d, "date");
  const scheduledField = readDateField(d, "scheduledAt");
  const statusField = readStatusField(d);

  const fm: Frontmatter = {
    title: typeof d.title === "string" ? d.title : "",
    summary: typeof d.summary === "string" ? d.summary : undefined,
    // A normalized value when the field is valid; the ORIGINAL value verbatim
    // when it is present but invalid, so the invalidity survives into the
    // normalized representation and the coerced reader agrees with the raw one.
    // Discarding it here is what made the two readers disagree.
    date:
      dateField.state === "absent"
        ? undefined
        : dateField.state === "valid"
          ? dateField.value
          : (d.date as unknown as string),
    hero: typeof d.hero === "string" ? d.hero : undefined,
    ogImage: typeof d.ogImage === "string" ? d.ogImage : undefined,
    tags: Array.isArray(d.tags)
      ? d.tags.filter((t): t is string => typeof t === "string")
      : undefined,
    kpi: Array.isArray(d.kpi) ? (d.kpi as Frontmatter["kpi"]) : undefined,
    status:
      statusField.state === "absent"
        ? undefined
        : statusField.state === "valid"
          ? (statusField.value as Frontmatter["status"])
          : (d.status as unknown as Frontmatter["status"]),
    scheduledAt:
      scheduledField.state === "absent"
        ? undefined
        : scheduledField.state === "valid"
          ? scheduledField.value
          : (d.scheduledAt as unknown as string),
  };
  return fm;
}

/**
 * Derive the publication status for a frontmatter object.
 *
 * Deny-first. The failure modes this deliberately avoids:
 *   - an unrecognised or wrong-typed `status` must NOT fall through to date
 *     inference;
 *   - a present-but-invalid `date` or `scheduledAt` must NOT count as published,
 *     and must NOT be treated as merely absent;
 *   - a future `scheduledAt` must hide the item whatever `status` says.
 *
 * Documented precedence (highest first):
 *   0. ANY present-but-invalid metadata denies, before anything else is
 *      considered — so `{status:"published", date:"invalid"}` is hidden.
 *   1. A future `scheduledAt` always hides the item.
 *   2. `status: draft` always hides the item.
 *   3. `status: published` publishes it (unless rule 0 or 1 applies).
 *   4. `status: scheduled` publishes once `scheduledAt` has passed; without a
 *      usable `scheduledAt` it stays hidden.
 *   5. No `status`: a past `scheduledAt` or a past `date` publishes (legacy
 *      dated content); a future one hides.
 *   6. Anything absent stays hidden.
 */
export function getStatus(fm: Frontmatter): "draft" | "scheduled" | "published" {
  const source = fm as unknown as Record<string, unknown>;
  const now = Date.now();

  const statusField = readStatusField(source);
  const scheduledField = readDateField(source, "scheduledAt");
  const dateField = readDateField(source, "date");

  // Rule 0: present-but-invalid metadata denies, whatever the status says.
  if (statusField.state === "invalid") return "draft";
  if (scheduledField.state === "invalid") return "draft";
  if (dateField.state === "invalid") return "draft";

  const status = statusField.state === "valid" ? statusField.value : undefined;
  const scheduledMs = scheduledField.state === "valid" ? Date.parse(scheduledField.value) : undefined;
  const dateMs = dateField.state === "valid" ? Date.parse(dateField.value) : undefined;

  // Rule 1: a future schedule always hides the item.
  if (scheduledMs !== undefined && scheduledMs > now) return "scheduled";

  // Rule 2.
  if (status === "draft") return "draft";
  // Rule 3.
  if (status === "published") return "published";
  // Rule 4.
  if (status === "scheduled") return scheduledMs !== undefined ? "published" : "draft";
  // Rule 5a: legacy past `scheduledAt` with no status.
  if (scheduledMs !== undefined) return "published";
  // Rule 5b: legacy dated content with no status.
  if (dateMs !== undefined) return dateMs <= now ? "published" : "draft";
  // Rule 6.
  return "draft";
}

// Public visibility predicate: a doc is publicly visible only when its
// derived status is "published". Used by every public list/detail/related/
// metadata/sitemap surface so an editor cannot accidentally expose a
// draft, future-scheduled, or unknown-status article.
export function isPubliclyVisible(fm: Frontmatter): boolean {
  return getStatus(fm) === "published";
}

// Escape a string so it is safe to embed inside an HTML <script>
// element (which terminates on the first literal "</script" sequence).
// JSON-encoding (used by JSON.stringify) does NOT escape "</script", so
// we must substitute it explicitly. This is the standard OWASP guidance
// for inlining JSON-LD into HTML.
export function escapeForScriptTag(json: string): string {
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function loadKind(
  kind: "projects" | "blog" | "labs",
): Promise<Doc<Frontmatter>[]> {
  const base = path.join(CONTENT_ROOT, kind);
  let files: string[] = [];
  try {
    files = await walk(base);
  } catch {
    return [];
  }

  const docs: Doc<Frontmatter>[] = [];
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const { data, content } = matter(raw);
    const frontmatter = coerceFrontmatter(data);
    if (!frontmatter.title) continue;

    docs.push({
      slug: toSlug(file, kind),
      frontmatter,
      content,
    });
  }
  return docs;
}

// Public list helpers apply visibility filtering so a single imported
// `allPublicWriting` cannot accidentally leak drafts. The bare
// `allProjects`/`allWriting`/`allLabs` names are kept as public-only
// aliases as well, so no exported list reader is unfiltered.
function visible(docs: Doc<Frontmatter>[]): Doc<Frontmatter>[] {
  return docs.filter((d) => isPubliclyVisible(d.frontmatter));
}

export async function allProjects(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("projects"));
}
export async function allWriting(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("blog"));
}
export async function allLabs(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("labs"));
}

// Public projections used by every public reader.
export async function allPublicProjects(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("projects"));
}
export async function allPublicWriting(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("blog"));
}
export async function allPublicLabs(): Promise<Doc<Frontmatter>[]> {
  return visible(await loadKind("labs"));
}

// Single-doc lookup with public visibility check.
export async function findPublicWriting(
  pillar: string,
  slug: string,
): Promise<Doc<Frontmatter> | null> {
  const docs = await loadKind("blog");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;
  if (!isPubliclyVisible(doc.frontmatter)) return null;
  return doc;
}
export async function findPublicProject(
  slug: string,
): Promise<Doc<Frontmatter> | null> {
  const docs = await loadKind("projects");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;
  if (!isPubliclyVisible(doc.frontmatter)) return null;
  return doc;
}
export async function findPublicLab(
  slug: string,
): Promise<Doc<Frontmatter> | null> {
  const docs = await loadKind("labs");
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;
  if (!isPubliclyVisible(doc.frontmatter)) return null;
  return doc;
}