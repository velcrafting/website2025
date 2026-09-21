// Gate B: shared service entry points for the editor routes and pages.
//
// Ordering rule that these helpers exist to make easy: authorization is checked
// BEFORE the store is opened. Opening the store creates directories and runs
// migrations, which is a side effect, so a denied request must never reach it.

import type { EditorStore } from "./repository/store";
import { openEditorStore } from "./repository/store";
import { editorStorageMode } from "./storage-mode";
import { currentEditorEnvironment } from "./validation/target";

export async function withEditorStore<T>(fn: (store: EditorStore) => T | Promise<T>): Promise<T> {
  const store = await openEditorStore();
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

/**
 * The identified human whose editorial action this is. Gate B runs on the
 * existing shared-key admin session, which carries no identity, so the subject
 * is configured locally. It is a recorded claim, not proof: the Gate B result
 * states plainly that human identity rests on observed interaction, not on this
 * value.
 */
export function currentHumanSubject(): string {
  const raw = (process.env.EDITOR_HUMAN_SUBJECT_ID ?? "").trim();
  if (editorStorageMode() === "postgres" && !raw) {
    throw new Error("EDITOR_HUMAN_SUBJECT_ID is required for hosted editor actions");
  }
  return raw || "local-editor";
}

/** The bounded local test publication target. Loopback only. */
export function currentTestTarget(): string {
  const raw = editorStorageMode() === "postgres"
    ? (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim()
    : (process.env.EDITOR_TEST_TARGET ?? "").trim();
  return raw || "http://127.0.0.1:3410";
}

export { currentEditorEnvironment };

export function isEditorEnabled(): boolean {
  return (process.env.EDITOR_ENABLED ?? "true").trim() !== "false";
}
