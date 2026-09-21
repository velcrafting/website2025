// Gate B: bounded validation for capture input.
//
// Scope limit, stated honestly: this checks the LITERAL host only. DNS
// resolution, redirect targets and decompression limits are NOT implemented in
// Gate B, so this does not by itself establish that a fetch cannot reach an
// internal service. The manual-source path performs no network read at all;
// only the single bounded public retrieval in B4 does, and it is restricted to
// one provider.

import { EditorError } from "../contracts/errors";
import { ACCESS_LEVELS, type AccessLevel } from "../contracts/types";

export type ManualSourceInput = {
  provider?: string;
  kind?: string;
  upstreamId?: string | null;
  canonicalUrl: string;
  title: string;
  authors?: string[] | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
  accessLevel?: AccessLevel;
  note?: string | null;
  referringUrl?: string | null;
};

export type NormalisedSourceInput = {
  provider: string;
  kind: string;
  upstreamId: string | null;
  canonicalUrl: string;
  title: string;
  authors: string[] | null;
  publishedAt: string | null;
  updatedAt: string | null;
  accessLevel: AccessLevel;
  note: string | null;
  referringUrl: string | null;
};

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map((p) => Number(p));
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

/** Loopback, private, link-local and reserved literal addresses. */
function isBlockedLiteralHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return true;
  }
  const v4 = ipv4Parts(lower);
  if (v4) {
    const [a, b] = v4;
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  // IPv6 literals arrive bracketed from URL parsing.
  const bare = lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
  if (bare === "::1" || bare === "::") return true;
  if (bare.startsWith("fc") || bare.startsWith("fd")) return true; // unique-local fc00::/7
  if (bare.startsWith("fe8") || bare.startsWith("fe9") || bare.startsWith("fea") || bare.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  return false;
}

export function assertSafePublicUrl(raw: string, field = "canonicalUrl"): URL {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new EditorError("UNSAFE_URL", `${field} is not a valid absolute URL`, { field, value: raw });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EditorError("UNSAFE_URL", `${field} must use http or https`, {
      field,
      protocol: url.protocol,
    });
  }
  if (url.username || url.password) {
    throw new EditorError("UNSAFE_URL", `${field} must not carry credentials`, { field });
  }
  if (!url.hostname) {
    throw new EditorError("UNSAFE_URL", `${field} must have a host`, { field });
  }
  if (isBlockedLiteralHost(url.hostname)) {
    throw new EditorError("UNSAFE_URL", `${field} points at a loopback or private address`, {
      field,
      host: url.hostname,
    });
  }
  return url;
}

function requireText(value: unknown, field: string, max = 2000): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new EditorError("VALIDATION_FAILED", `${field} is required`, { field });
  }
  if (text.length > max) {
    throw new EditorError("VALIDATION_FAILED", `${field} is too long`, { field, max });
  }
  return text;
}

function optionalText(value: unknown, field: string, max = 2000): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > max) {
    throw new EditorError("VALIDATION_FAILED", `${field} is too long`, { field, max });
  }
  return text;
}

function optionalTimestamp(value: unknown, field: string): string | null {
  const text = optionalText(value, field, 40);
  if (text === null) return null;
  if (Number.isNaN(Date.parse(text))) {
    throw new EditorError("VALIDATION_FAILED", `${field} is not a parseable date`, { field });
  }
  return new Date(text).toISOString();
}

function optionalStringArray(value: unknown, field: string): string[] | null {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value)) {
    throw new EditorError("VALIDATION_FAILED", `${field} must be an array`, { field });
  }
  const out = value.map((entry) => String(entry).trim()).filter(Boolean);
  if (out.length > 200) {
    throw new EditorError("VALIDATION_FAILED", `${field} has too many entries`, { field });
  }
  return out;
}

export function validateSourceInput(input: ManualSourceInput): NormalisedSourceInput {
  if (!input || typeof input !== "object") {
    throw new EditorError("VALIDATION_FAILED", "source input must be an object");
  }
  const canonical = assertSafePublicUrl(input.canonicalUrl, "canonicalUrl");
  const referring = input.referringUrl
    ? assertSafePublicUrl(input.referringUrl, "referringUrl").toString()
    : null;
  const accessLevel = (input.accessLevel ?? "metadata_only") as AccessLevel;
  if (!ACCESS_LEVELS.includes(accessLevel)) {
    throw new EditorError("VALIDATION_FAILED", "unknown accessLevel", { accessLevel });
  }
  return {
    provider: optionalText(input.provider, "provider", 120) ?? canonical.hostname,
    kind: optionalText(input.kind, "kind", 60) ?? "web",
    upstreamId: optionalText(input.upstreamId, "upstreamId", 200),
    canonicalUrl: canonical.toString(),
    title: requireText(input.title, "title", 500),
    // Missing author/date stays null; it is never invented.
    authors: optionalStringArray(input.authors, "authors"),
    publishedAt: optionalTimestamp(input.publishedAt, "publishedAt"),
    updatedAt: optionalTimestamp(input.updatedAt, "updatedAt"),
    accessLevel,
    note: optionalText(input.note, "note", 4000),
    referringUrl: referring,
  };
}
