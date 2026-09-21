// Gate B / S05: the protected preview.
//
// Implemented as a route handler rather than a page component so the response
// can carry an explicit `Cache-Control: private, no-store` header — a preview must
// never be cached by a shared proxy, and Next's metadata API has no hook for
// response headers. Authorization is checked here as well as by the root
// middleware matcher, and the body is only rendered after the session passes.

import { requireAdmin } from "@/lib/admin";
import { editorErrorResponse } from "@/editor/api";
import { blockKindOf } from "@/editor/contracts/types";
import { escapeHtml, renderBlocksToHtml } from "@/editor/render/bundle";
import { rendererCss } from "@/editor/render/styles";
import { getBundleForRevision } from "@/editor/repository/bundles";
import { getItem, getRevision } from "@/editor/repository/revisions";
import { openEditorStore } from "@/editor/repository/store";

export const dynamic = "force-dynamic";

function html(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<meta name="robots" content="noindex, nofollow"><style>${rendererCss}</style></head>` +
      `<body class="prose">${body}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // Private preview: never cached, never shared.
        "cache-control": "private, no-store, max-age=0",
        "x-robots-tag": "noindex, nofollow",
      },
    },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ revisionId: string }> },
) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "cache-control": "private, no-store, max-age=0" },
    });
  }

  try {
    const { revisionId } = await context.params;
    const store = (await openEditorStore());
    try {
      const revision = (await getRevision(store.db, revisionId));
      if (!revision) {
        return html("Preview not found", "<p>Revision not found.</p>", 404);
      }
      const item = (await getItem(store.db, revision.itemId));
      const bundle = (await getBundleForRevision(store.db, revision.id));

      // Serve the bundle's own output — the bytes an approval binds — instead of rendering
      // the blocks again here. The inline renderer this replaces emitted only headings and
      // paragraphs, so a figure or a callout was silently absent from the preview while the
      // approved bundle contained it. A revision with no bundle falls back to the same
      // sanctioned renderer rather than a second implementation that could drift.
      const rendered =
        typeof bundle?.outputs?.web_html === "string"
          ? bundle.outputs.web_html
          : renderBlocksToHtml(revision.blocks);

      const blockNotes = revision.blocks
        .map(
          (block, index) =>
            `<li>${index}: ${escapeHtml(blockKindOf(block))} · ` +
            `${block.humanLocked ? "locked" : "unlocked"} · ${escapeHtml(block.origin)}</li>`,
        )
        .join("");

      const body =
        `<p><strong>Protected preview — not published.</strong> ` +
        `This preview is private and is not part of the public site.</p>` +
        `<h1>${escapeHtml(revision.title)}</h1>` +
        `<p>${escapeHtml(item?.slug ?? "")} · revision ${revision.revisionNumber} · ` +
        `${escapeHtml(revision.editorialState)}</p>` +
        `<p>content sha256 <code>${escapeHtml(revision.contentSha256)}</code></p>` +
        `<p>manifest sha256 <code>${escapeHtml(bundle?.manifestSha256 ?? "unbundled")}</code></p>` +
        `<p>renderer <code>${escapeHtml(bundle?.rendererVersion ?? "unbundled")}</code></p>` +
        rendered +
        `<h2>Block provenance</h2><ul>${blockNotes}</ul>`;

      return html(`${revision.title} — preview`, body);
    } finally {
      (await store.close());
    }
  } catch (error) {
    return editorErrorResponse(error);
  }
}
