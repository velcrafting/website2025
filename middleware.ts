import { NextResponse } from "next/server";

export const config = {
  matcher: [
    // Intercept all nested paths under /labs except the index itself
    "/labs/:path*",
  ],
};

const OWNER = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";

async function isMicroSlug(slug: string): Promise<boolean> {
  try {
    // Heuristic: micro sites publish lab.json at their root
    const url = `https://${OWNER}.github.io/${slug}/lab.json`;
    const res = await fetch(url, { method: "HEAD", cache: "force-cache" });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function middleware(req: Request) {
  const url = new URL(req.url);
  const { pathname } = url;

  // Skip the listing page and anything not under /labs
  if (pathname === "/labs" || pathname === "/labs/") return NextResponse.next();
  if (!pathname.startsWith("/labs/")) return NextResponse.next();

  // Extract first path segment after /labs
  const rest = pathname.slice(6); // remove "/labs/"
  const [slug, ...tail] = rest.split("/");
  if (!slug) return NextResponse.next();

  // If the slug looks like a known micro (has lab.json on GH Pages), rewrite to our proxy
  if (await isMicroSlug(slug)) {
    const rewritten = new URL(`/labs/micro/${slug}/${tail.join("/")}`, url.origin);
    return NextResponse.rewrite(rewritten);
  }

  return NextResponse.next();
}

