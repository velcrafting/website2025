import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isUuid } from "./request-boundary";

import { authSettings, type AuthSurface } from "./auth-settings";

export async function consultingAuth(surface: AuthSurface) {
  const settings = authSettings(surface);
  if (!settings) return null;
  const jar = await cookies();
  return createServerClient(settings.url, settings.key, {
    cookieOptions: settings.options,
    cookies: {
      getAll: () => jar.getAll(),
      setAll(changes) {
        for (const { name, value, options } of changes) {
          try { jar.set(name, value, { ...options, ...settings.options }); }
          catch { /* Server Components cannot write; private middleware handles refresh. */ }
        }
      },
    },
  });
}

export async function verifiedIdentity(surface: AuthSurface) {
  const client = await consultingAuth(surface);
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  const user = data?.user;
  return !error && user?.email_confirmed_at && user.email && isUuid(user.id)
    ? { id: user.id, email: user.email.trim().toLowerCase() } : null;
}
