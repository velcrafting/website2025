// Gate B: shared error type.
//
// Every repository/service failure carries a stable machine code so routes can
// map it to an HTTP status and the harness can assert on the code rather than on
// a message string.

export const EDITOR_ERROR_CODES = [
  "VALIDATION_FAILED",
  "UNSAFE_URL",
  "NOT_FOUND",
  "CONFLICT_STALE_REVISION",
  "DUPLICATE_REVISION",
  "DUPLICATE_SOURCE_VERSION",
  "DUPLICATE_SOURCE",
  "DUPLICATE_ITEM",
  "DUPLICATE_OPERATION",
  "APPROVAL_INVALID",
  "APPROVAL_EXPIRED",
  "APPROVAL_REVISION_MISMATCH",
  "APPROVAL_INVALIDATED",
  "TARGET_NOT_ALLOWED",
  "LEASE_HELD",
  "SESSION_REQUIRED",
  "INTERNAL",
] as const;

export type EditorErrorCode = (typeof EDITOR_ERROR_CODES)[number];

export class EditorError extends Error {
  readonly code: EditorErrorCode;
  readonly details: Record<string, unknown>;
  /** Stable parallel to EditorError for `instanceof` checks across realms. */
  readonly __editorError = true;

  constructor(code: EditorErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "EditorError";
    this.code = code;
    this.details = details;
  }
}

export function isEditorError(value: unknown): value is EditorError {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as { __editorError?: unknown }).__editorError === true,
  );
}

/** HTTP status for each failure code, used by the editor API routes. */
export function statusForCode(code: EditorErrorCode): number {
  switch (code) {
    case "SESSION_REQUIRED":
      return 401;
    case "VALIDATION_FAILED":
    case "UNSAFE_URL":
      return 400;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT_STALE_REVISION":
    case "DUPLICATE_REVISION":
    case "DUPLICATE_SOURCE_VERSION":
    case "DUPLICATE_SOURCE":
    case "DUPLICATE_ITEM":
    case "DUPLICATE_OPERATION":
    case "APPROVAL_REVISION_MISMATCH":
    case "APPROVAL_INVALIDATED":
    case "LEASE_HELD":
      return 409;
    case "APPROVAL_INVALID":
    case "APPROVAL_EXPIRED":
    case "TARGET_NOT_ALLOWED":
      return 403;
    default:
      return 500;
  }
}
