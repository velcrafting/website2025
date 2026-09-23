// Gate B: deterministic canonicalisation and hashing.
//
// Approval binds exact bytes, so every hash in Gate B is derived here. The
// canonicaliser sorts object keys recursively and refuses values that cannot be
// serialised deterministically, so a hash never depends on property
// insertion order.

import { createHash } from "node:crypto";
import { EditorError } from "./errors";

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function assertSerialisable(value: unknown, at: string, seen: Set<object>): void {
  if (value === null) return;
  const type = typeof value;
  if (type === "string" || type === "boolean") return;
  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new EditorError("VALIDATION_FAILED", `Non-finite number at ${at}`);
    }
    return;
  }
  if (type === "undefined") return;
  if (type === "object") {
    const obj = value as object;
    if (seen.has(obj)) {
      throw new EditorError("VALIDATION_FAILED", `Cycle in canonical input at ${at}`);
    }
    if (value instanceof Date) {
      throw new EditorError(
        "VALIDATION_FAILED",
        `Date at ${at} must be serialised as a UTC ISO-8601 string before hashing`,
      );
    }
    seen.add(obj);
    if (Array.isArray(value)) {
      value.forEach((entry, i) => assertSerialisable(entry, `${at}[${i}]`, seen));
    } else {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        assertSerialisable(v, `${at}.${k}`, seen);
      }
    }
    seen.delete(obj);
    return;
  }
  throw new EditorError("VALIDATION_FAILED", `Unsupported ${type} at ${at}`);
}

function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalise(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${canonicalise(obj[k])}`)
      .join(",");
    return `{${body}}`;
  }
  throw new EditorError("VALIDATION_FAILED", "Unsupported value in canonical input");
}

/**
 * Canonical JSON: keys sorted, `undefined` omitted, arrays order-preserving.
 * Two structurally equal inputs always produce identical output, whatever order
 * the caller built them in.
 */
export function canonicalJson(value: unknown): string {
  assertSerialisable(value, "$", new Set());
  return canonicalise(value);
}

export function hashCanonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
