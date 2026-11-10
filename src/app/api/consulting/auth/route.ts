import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { consultingAuth } from "@/consulting/server/auth";
import { authSettings, type AuthSurface } from "@/consulting/server/auth-settings";
import { consultingSql } from "@/consulting/server/database";
import { getExplorerSession } from "@/consulting/server/explorer-session";
import { boundedJson, isClientMutation, isPublicMutation, json } from "@/consulting/server/request-boundary";

export async function POST(request: Request) {
  const surface: AuthSurface | null = isClientMutation(request) ? "client" : isPublicMutation(request) ? "prospect" : null;
  if (!surface) return json({ error: "Unavailable" }, 403);
  const settings = authSettings(surface);
  if (!settings) return json({ error: "Email sign-in is unavailable" }, 503);
  let body: { action?: unknown; email?: unknown; code?: unknown };
  try {
    const parsed = await boundedJson(request, 2048);
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed;
  } catch { return json({ error: "Invalid request" }, 400); }
  const { action } = body;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (action !== "logout" && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
    return json({ error: "Enter a valid email address" }, 400);
  }
  try {
    const client = await consultingAuth(surface);
    if (!client) return json({ error: "Email sign-in is unavailable" }, 503);
    if (action === "logout" && surface === "client") {
      const { error } = await client.auth.signOut({ scope: "local" });
      return error ? json({ error: "Sign-out is unavailable" }, 503) : json({ ok: true });
    }
    const explorer = surface === "prospect" ? await getExplorerSession(request) : null;
    if (surface === "prospect" && !explorer) return json({ error: "Start an explorer session first" }, 409);
    const sql = await consultingSql();
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    if (action !== "send" && action !== "verify") return json({ error: "Invalid action" }, 400);
    const [allowed] = await sql<{ allowed: boolean }[]>`select velcrafting_private.take_auth_allowance(
      ${surface}, ${action}, ${digest(email)}, ${explorer?.id ?? null}) as allowed`;
    if (!allowed.allowed) return json({ error: "Try again later" }, 429);
    if (action === "send") {
      if (explorer && process.env.VELCRAFTING_PROSPECT_ENROLLMENT_ENABLED === "1" && process.env.VELCRAFTING_SUPABASE_ENROLLMENT_KEY) {
        const enrollment = createClient(settings.url, process.env.VELCRAFTING_SUPABASE_ENROLLMENT_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await enrollment.auth.admin.createUser({ email, email_confirm: false });
      }
      await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
      return json({ ok: true, message: "If this address can sign in, a code is on its way." });
    }
    const token = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6,10}$/.test(token)) return json({ error: "Enter the email code" }, 400);
    const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error || !data.user?.email_confirmed_at || data.user.email?.trim().toLowerCase() !== email) {
      return json({ error: "Code was invalid or expired" }, 400);
    }
    if (explorer) {
      const [claim] = await sql<{ claimed: boolean }[]>`select velcrafting_private.claim_prospect(
        ${explorer.id}, ${data.user.id}, ${email}) as claimed`;
      if (!claim.claimed) {
        await client.auth.signOut({ scope: "local" });
        return json({ error: "This exploration could not be linked" }, 409);
      }
    }
    return json({ ok: true });
  } catch { return json({ error: "Email sign-in is unavailable" }, 503); }
}
