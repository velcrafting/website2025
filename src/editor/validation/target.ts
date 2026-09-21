// Gate B: publication target allowlist.
//
// Gate B publishes only to a bounded local test target. A production endpoint
// must be unrepresentable here, not merely discouraged, so the check is a strict
// loopback-host test rather than a substring search.

import { EditorError } from "../contracts/errors";
import { editorStorageMode } from "../storage-mode";
import type { Environment } from "../contracts/types";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

export function assertAllowedTestTarget(targetRef: string): string {
  const raw = String(targetRef ?? "").trim();
  if (!raw) {
    throw new EditorError("TARGET_NOT_ALLOWED", "targetRef is required");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EditorError("TARGET_NOT_ALLOWED", "targetRef must be an absolute URL", { raw });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EditorError("TARGET_NOT_ALLOWED", "targetRef must use http or https", {
      protocol: url.protocol,
    });
  }
  const host = url.hostname.toLowerCase();
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (!LOOPBACK_HOSTS.has(bare)) {
    throw new EditorError(
      "TARGET_NOT_ALLOWED",
      "Gate B publishes to a loopback test target only",
      { host: bare },
    );
  }
  return url.toString();
}

export function currentEditorEnvironment(): Environment {
  if (editorStorageMode() !== "postgres") return "local_test";
  if (process.env.VERCEL !== "1") {
    throw new EditorError("TARGET_NOT_ALLOWED", "Hosted approvals require a Vercel preview or production runtime");
  }
  if (process.env.VERCEL_ENV === "preview") return "hosted_preview";
  if (process.env.VERCEL_ENV === "production") return "production";
  throw new EditorError("TARGET_NOT_ALLOWED", "Hosted editor environment is not recognized");
}

export function assertApprovalTarget(targetRef: string, environment: Environment): string {
  if (environment === "local_test") return assertAllowedTestTarget(targetRef);
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  let target: URL;
  let site: URL;
  try {
    target = new URL(String(targetRef ?? "").trim());
    site = new URL(configured);
  } catch {
    throw new EditorError("TARGET_NOT_ALLOWED", "Hosted approval requires the configured site origin");
  }
  const expectedVercelEnvironment = environment === "hosted_preview" ? "preview" : "production";
  if (
    process.env.VERCEL !== "1" ||
    process.env.VERCEL_ENV !== expectedVercelEnvironment ||
    target.protocol !== "https:" ||
    site.protocol !== "https:" ||
    site.username || site.password ||
    site.pathname !== "/" || site.search || site.hash ||
    target.origin !== site.origin ||
    target.pathname !== "/" || target.search || target.hash ||
    target.username || target.password
  ) {
    throw new EditorError("TARGET_NOT_ALLOWED", "Approval target must exactly match this hosted environment", {
      environment,
    });
  }
  return target.origin;
}

export function isAllowedTestTarget(targetRef: string): boolean {
  try {
    assertAllowedTestTarget(targetRef);
    return true;
  } catch {
    return false;
  }
}
