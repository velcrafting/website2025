// Gate B: session guard for the editor's server components.
//
// Note on defence in depth: the repository's root `middleware.ts` is NOT compiled
// into this project's production build (the build's middleware manifest is empty),
// so /admin/* has no middleware-level protection here. The existing admin pages
// handle that themselves with `if (!(await isAdmin())) redirect("/admin/login")`.
// These editor pages follow the same convention, and every mutation additionally
// re-checks the session at the action/route before any side effect, so a missing
// middleware cannot turn into an unguarded write.

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";

/** Server component guard: send an unauthenticated visitor to the login page. */
export async function requireEditorSession(): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    redirect("/admin/login");
  }
}
