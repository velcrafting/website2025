// middleware.ts — the supported project entrypoint under src/.
//
// The old copy lived under src/app, where Next did not discover it. Keep this named export explicit
// for the current Next 15 build and verify the generated middleware manifest when changing its path.
import { NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";
import { authSettings } from "@/consulting/server/auth-settings";
import { clientRoute } from "@/consulting/server/client-routing";
import { configuredOrigin, noStore } from "@/consulting/server/request-boundary";

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr).*)"],
};

const ADMIN_KEY = process.env.ADMIN_KEY;
const ADMIN_COOKIE = "admin";

/* -------- Admin API path whitelist -------- */
const ADMIN_NEWSLETTER_PREFIXES = new Set<string>([
  "/api/newsletter/health",
  "/api/newsletter/count",
  "/api/newsletter/contacts",
  "/api/newsletter/export",
  "/api/newsletter/preview",
  "/api/newsletter/broadcast",
  "/api/newsletter/subscription",
]);

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const { pathname } = url;

  const route = clientRoute(req.headers.get("host"), pathname);
  if (route.kind === "deny") return new NextResponse("Not found", { status: 404, headers: noStore });
  if (route.kind === "rewrite") {
    const origin = configuredOrigin(process.env.CLIENT_SITE_ORIGIN);
    if (!origin) return new NextResponse("Not found", { status: 404, headers: noStore });
    const destination = new URL(route.path + url.search, origin);
    let response = NextResponse.rewrite(destination, { request: { headers: req.headers }, headers: noStore });
    const settings = authSettings("client");
    if (settings && req.cookies.getAll().some(({ name }) => name === settings.options.name || name.startsWith(settings.options.name + "."))) {
      const auth = createServerClient(settings.url, settings.key, {
        cookieOptions: settings.options,
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll(changes) {
            for (const { name, value } of changes) req.cookies.set(name, value);
            response = NextResponse.rewrite(destination, { request: { headers: req.headers }, headers: noStore });
            for (const { name, value, options } of changes) response.cookies.set(name, value, { ...options, ...settings.options });
          },
        },
      });
      await auth.auth.getClaims().catch(() => null);
    }
    return response;
  }

  /* ---------- Protect admin pages ---------- */
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login" || pathname === "/admin/login/") {
      return NextResponse.next();
    }
    const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!ADMIN_KEY || cookie !== ADMIN_KEY) {
      url.pathname = "/admin/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  /* ---------- Guard newsletter admin APIs with x-admin-key ---------- */
  if (pathname.startsWith("/api/newsletter/")) {
    // public subscribe endpoint stays open: /api/newsletter (exact)
    if (pathname === "/api/newsletter") {
      return NextResponse.next();
    }

    // For the admin endpoints above, require header
    const isAdminEndpoint = [...ADMIN_NEWSLETTER_PREFIXES].some((p) =>
      pathname.startsWith(p)
    );

    if (isAdminEndpoint) {
      const key = req.headers.get("x-admin-key");
      if (!ADMIN_KEY || key !== ADMIN_KEY) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }

    return NextResponse.next();
  }

  /*
    The former /labs proxy stood here: it matched "/labs/:path*", did a GitHub Pages HEAD probe and
    rewrote the request to "/labs/micro/<slug>/...". Neither /labs nor /labs/micro exists as a route in
    this app (the surface is /tools), and because this file never compiled that proxy has never run, so
    making it live would only add an external network round-trip before a 404. If old /labs links ever
    mattered, the matcher entry and the probe helper can be restored from git history.
  */
  return NextResponse.next();
}
