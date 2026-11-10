export type ExplorerBlock =
  | Readonly<{ kind: "question"; text: string }>
  | Readonly<{ kind: "scope_effect"; text: string }>;

// No action, URL, markup, state path or other opaque property crosses this boundary.
export function parseExplorerBlock(value: unknown): ExplorerBlock | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "kind") || !Object.hasOwn(record, "text")) return null;
  const { kind, text } = record;
  if (kind !== "question" && kind !== "scope_effect") return null;
  if (typeof text !== "string" || !text.trim() || text.length > 400 || /[<>\u0000-\u001f\u007f]|(?:[a-z][a-z0-9+.-]*:\/\/|javascript:|data:)/i.test(text)) return null;
  return { kind, text };
}
