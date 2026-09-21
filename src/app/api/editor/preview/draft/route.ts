// The unsaved reader preview.
//
// This route renders, and does nothing else. It imports no repository, opens no store, and
// writes no revision, bundle or approval — a preview must never create the artifact it is
// previewing, or "just looking" would move the identity an approval is bound to and could
// replace already-approved bytes. The guarantee is structural rather than a promise: there is
// no import in this file through which a write could happen.
//
// It reads the SAME form the save action reads, through the SAME helper
// (`blocksFromForm`), validates it with the SAME validator, and renders with the SAME
// renderer that builds a bundle's `web_html`. So what the author sees here is what a save
// would store, not an approximation of it.
//
// Protected: an admin session is required, and the request must be same-origin. Draft text is
// private, so a cross-site request carrying the author's cookie must not be able to render —
// and therefore read — it.

import { requireAdmin } from "@/lib/admin";
import { isEditorError } from "@/editor/contracts/errors";
import { blocksFromForm } from "@/editor/forms/editor-form";
import { RENDERER_VERSION, renderBlocksToHtml } from "@/editor/render/bundle";
import { renderIssueShellHtml, type IssueShellSource } from "@/editor/render/issue-shell";
import { normaliseBlocks } from "@/editor/validation/revision";

export const dynamic = "force-dynamic";

/** An interactive request; well below anything a real form carries. */
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_SOURCES = 50;

/**
 * The live draft is labelled as such wherever it renders. It has no bundle, no approval and no
 * revision hash, and the panel links to the protected preview of a saved revision for those.
 */
const LIVE_DRAFT_NOTICE =
  "Preview only — not published. Saving creates a new revision; the saved draft and its exact " +
  "approved bytes are available from the editor.";

const PRIVATE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // A preview of unsaved, private writing must never be cached or shared.
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
} as const;

function refuse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: PRIVATE_HEADERS });
}

/**
 * The origins this app trusts for a preview request.
 *
 * Configured explicitly; see the note at the call site for why it is never derived from the
 * request. With nothing configured, only plain-HTTP loopback origins are trusted, which is how this
 * isolated milestone is served — a deployment on a real host must set `EDITOR_PREVIEW_ORIGINS`.
 */
function trustedOrigins(): readonly string[] {
  return (process.env.EDITOR_PREVIEW_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  // A browser sends Origin on every same-origin POST, so refusing a missing one is the safe
  // direction: a non-browser caller can state its origin explicitly.
  if (!origin) return false;

  const configured = trustedOrigins();
  if (configured.length > 0) return configured.includes(origin);

  try {
    const url = new URL(origin);
    const loopback =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "[::1]" ||
      url.hostname === "::1";
    return url.protocol === "http:" && loopback;
  } catch {
    return false;
  }
}

/**
 * Read at most `limit` bytes of the body, refusing as soon as the REAL size passes it.
 *
 * The declared Content-Length is not evidence: it can be absent (a chunked body) or it can lie.
 * The size that matters is the number of bytes actually read, so the bound is applied while
 * reading rather than trusted from a header.
 */
async function readBounded(request: Request, limit: number): Promise<{ bytes: ArrayBuffer | null }> {
  const body = request.body;
  if (!body) return { bytes: new ArrayBuffer(0) };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return { bytes: null };
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes: joined.buffer };
}

/** The stored revision's pinned sources, supplied by the page. Never invented, never persisted. */
function readSources(raw: unknown): IssueShellSource[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.slice(0, MAX_SOURCES).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    // Only http(s) destinations become links; anything else is dropped rather than becoming an href.
    if (!title || !/^https?:\/\//i.test(url)) return [];
    return [
      {
        title,
        url,
        provider: typeof record.provider === "string" ? record.provider : null,
        meta: typeof record.meta === "string" ? record.meta : null,
      },
    ];
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return refuse("Not authorized to preview this draft.", 401);
  }

  // Same-origin only: a page on another site must not be able to make the author's browser
  // render — and therefore read — their private draft.
  //
  // The trusted origins are configured, never derived from the request. An earlier version
  // compared against the Host header and the request URL's host, which accepted a forged
  // `Host: evil.example` paired with `Origin: https://evil.example` — a Host header is
  // attacker-controllable, so it cannot be a source of trust. Forwarded headers are not consulted
  // either, and the scheme is compared, so `https` cannot inherit trust granted to `http`.
  if (!isTrustedOrigin(request)) {
    return refuse("This preview request did not come from this site.", 403);
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_PREVIEW_BYTES) {
    return refuse("That draft is too large to preview.", 413);
  }

  try {
    const { bytes } = await readBounded(request, MAX_PREVIEW_BYTES);
    if (bytes === null) return refuse("That draft is too large to preview.", 413);
    const contentType = request.headers.get("content-type") ?? "";
    const formData = await new Response(bytes, {
      headers: { "content-type": contentType },
    }).formData();
    const blocks = normaliseBlocks(blocksFromForm(formData, true));
    const sources = readSources(formData.get("previewSources"));
    const kind = formData.get("documentType") === "article" ? "article" : "issue";
    // The COMPLETE output: the same furniture the published reader puts around the body, with the
    // title and summary the form currently holds and the revision's stored sources.
    const html = renderIssueShellHtml({
      kind,
      title: String(formData.get("title") ?? "").trim() || "Untitled",
      summary: String(formData.get("summary") ?? "").trim() || null,
      byline: String(formData.get("byline") ?? "").trim() || null,
      bodyHtml: renderBlocksToHtml(blocks),
      sources,
      notice: LIVE_DRAFT_NOTICE,
      emptySourcesNote:
        "No structured source link is recorded for this revision. Provenance, if any, appears in the text above.",
    });
    const payload = JSON.stringify({
      html,
      blockCount: blocks.length,
      sourceCount: sources.length,
      rendererVersion: RENDERER_VERSION,
    });
    return new Response(payload, { headers: PRIVATE_HEADERS });
  } catch (error) {
    // A validation failure here is the author's own content, so the validator's readable
    // reason is returned rather than a generic failure. Nothing was written either way.
    if (isEditorError(error)) {
      return refuse(error.message || "That draft cannot be previewed yet.", 422);
    }
    return refuse("The preview could not be rendered.", 500);
  }
}
