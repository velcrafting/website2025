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
    // Prefer lab.json, but fall back to index.html to be resilient
    const base = `https://${OWNER}.github.io/${slug}`;
    const headLab = await fetch(`${base}/lab.json`, { method: "HEAD", cache: "force-cache" });
    if (headLab.ok) return true;
    const headIndex = await fetch(`${base}/index.html`, { method: "HEAD", cache: "force-cache" });
    return headIndex.ok;
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
    const target = new URL(`/labs/micro/${slug}/${tail.join("/")}`, url.origin);
    // Keep the original URL visible while serving proxy content
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}
