// src/middleware.ts
import { NextResponse } from "next/server";

export const config = {
  matcher: [
    // Existing Labs proxy handling
    "/labs/:path*",
    // Admin-ish newsletter endpoints (server-only use via curl/Postman)
    "/api/newsletter/:path*",
  ],
};

const OWNER = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";
const ADMIN_KEY = process.env.ADMIN_KEY;

/* -------- Labs helpers (unchanged) -------- */
async function isMicroSlug(slug: string): Promise<boolean> {
  try {
    const base = `https://${OWNER}.github.io/${slug}`;
    const headLab = await fetch(`${base}/lab.json`, { method: "HEAD", cache: "force-cache" });
    if (headLab.ok) return true;
    const headIndex = await fetch(`${base}/index.html`, { method: "HEAD", cache: "force-cache" });
    return headIndex.ok;
  } catch {
    return false;
  }
}

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

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const { pathname } = url;

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

  /* ---------- Existing Labs proxy behavior ---------- */
  // Skip the listing page and anything not under /labs
  if (pathname === "/labs" || pathname === "/labs/") return NextResponse.next();
  if (!pathname.startsWith("/labs/")) return NextResponse.next();

  // Extract first path segment after /labs
  const rest = pathname.slice(6); // remove "/labs/"
  const [slug, ...tail] = rest.split("/");
  if (!slug) return NextResponse.next();

  // If the slug looks like a known micro (has lab.json on GH Pages), rewrite to our proxy
  if (await isMicroSlug(slug)) {
    const target = new URL(`/labs/micro/${slug}/${tail.join("/")}`, url.origin);
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}