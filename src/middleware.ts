// middleware.ts — the supported project entrypoint under src/.
//
// The old copy lived under src/app, where Next did not discover it. Keep this named export explicit
// for the current Next 15 build and verify the generated middleware manifest when changing its path.
import { NextRequest, NextResponse } from "next/server";

export const config = {
  matcher: [
    // Admin dashboard and APIs
    "/admin/:path*",
    // Admin-ish newsletter endpoints (server-only use via curl/Postman)
    "/api/newsletter/:path*",
  ],
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

  /* ---------- Protect admin pages ---------- */
  if (pathname.startsWith("/admin")) {
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
