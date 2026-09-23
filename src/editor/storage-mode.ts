export function editorStorageMode(env: Record<string, string | undefined> = process.env): string {
  return (env.EDITOR_STORAGE_MODE ?? "sqlite").trim().toLowerCase();
}
