// Gate B / S06: the bounded source adapter.
//
// Two paths:
//   captureManualSource  — no network at all. Used by the fixture flow and by
//                          the editor for a manually supplied source.
//   fetchArxivLatestCsAI — exactly ONE ordinary public retrieval, from the
//                          documented arXiv API, used once for the first real
//                          loop. It is deliberately the only place Gate B reads
//                          the network, and it is labelled a plumbing fixture:
//                          it does not imply editorial endorsement.
//
// Scope limits, stated honestly: this does not follow redirects into private
// address space and does not re-resolve DNS for a redirect chain. That is
// adequate for a single hard-coded provider host on a local milestone and is NOT
// adequate for a general URL adapter (S12a).

import { EditorError } from "../contracts/errors";
import { createSourceWithCapture } from "../repository/sources";
import type { EditorStore } from "../repository/store";
import { withTransaction } from "../repository/store";
import type { ManualSourceInput } from "../validation/source";
import { assertSafePublicUrl } from "../validation/source";

export const ARXIV_QUERY_URL =
  "http://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=1";

export type CapturedSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  provider: string;
  upstreamId: string | null;
  accessLevel: string;
};

export async function captureManualSource(
  store: EditorStore,
  input: ManualSourceInput & { origin?: "human" | "fixture" },
): Promise<CapturedSource> {
  const result = await withTransaction(store.db, async () =>
    await createSourceWithCapture(store.db, input, {
      origin: input.origin ?? "human",
      adapter: "manual-source",
    }),
  );
  return {
    sourceId: result.source.id,
    canonicalUrl: result.source.canonicalUrl,
    title: result.source.title,
    provider: result.source.provider,
    upstreamId: result.source.upstreamId,
    accessLevel: result.source.accessLevel,
  };
}

function firstMatch(xml: string, pattern: RegExp): string | null {
  const match = pattern.exec(xml);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function allMatches(xml: string, pattern: RegExp): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    out.push(match[1].replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * One bounded read of the newest cs.AI submission. Returns a source input ready
 * for capture. The abstract is the only text read: the access level is
 * `abstract_only` and is not upgraded.
 */
export async function fetchArxivLatestCsAI(
  timeoutMs = 15_000,
): Promise<ManualSourceInput & { origin: "fixture" }> {
  const response = await fetch(ARXIV_QUERY_URL, {
    headers: { "user-agent": "velcrafting-gateb-local-proof/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new EditorError("INTERNAL", `arxiv query failed with HTTP ${response.status}`);
  }
  const xml = await response.text();
  const absUrl = firstMatch(xml, /<id>([^<]+)<\/id>/);
  const title = firstMatch(xml, /<title>([^<]+)<\/title>/);
  const published = firstMatch(xml, /<published>([^<]+)<\/published>/);
  const updated = firstMatch(xml, /<updated>([^<]+)<\/updated>/);
  const authors = allMatches(xml, /<name>([^<]+)<\/name>/);
  const summary = firstMatch(xml, /<summary>([^<]+)<\/summary>/);

  if (!absUrl || !title) {
    throw new EditorError("INTERNAL", "arxiv response did not contain an entry", {
      responseFragment: xml.slice(0, 200),
    });
  }
  // Validate before it is stored, using the same rules as any other capture.
  assertSafePublicUrl(absUrl, "canonicalUrl");
  const upstreamIdMatch = /\/abs\/([^/]+)$/.exec(absUrl);
  const upstreamId = upstreamIdMatch ? upstreamIdMatch[1] : null;

  return {
    provider: "arxiv",
    kind: "paper",
    upstreamId,
    canonicalUrl: absUrl,
    title,
    authors: authors.length ? authors : null,
    publishedAt: published,
    updatedAt: updated,
    accessLevel: "abstract_only",
    note: summary ? `Abstract (unverified excerpt): ${summary.slice(0, 400)}` : null,
    origin: "fixture",
  };
}
