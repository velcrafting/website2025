import { configuredOrigin } from "./request-boundary";

export type AuthSurface = "client" | "prospect";

export function authSettings(surface: AuthSurface) {
  const client = surface === "client";
  if (process.env[client ? "VELCRAFTING_CLIENT_AUTH_ENABLED" : "VELCRAFTING_PROSPECT_AUTH_ENABLED"] !== "1") return null;
  const origin = configuredOrigin(process.env[client ? "CLIENT_SITE_ORIGIN" : "PUBLIC_SITE_ORIGIN"]);
  const url = configuredOrigin(process.env.VELCRAFTING_SUPABASE_URL);
  const key = process.env.VELCRAFTING_SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !url || !key || origin === configuredOrigin(process.env[client ? "PUBLIC_SITE_ORIGIN" : "CLIENT_SITE_ORIGIN"])) return null;
  return { origin, url, key, options: {
    name: client ? "vel-client-session" : "vel-prospect-session",
    path: "/", httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" as const,
  } };
}
