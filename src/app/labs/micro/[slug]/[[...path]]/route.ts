// Generic proxy for any micro-site hosted on GitHub Pages under
// https://<owner>.github.io/<slug>/...

export const runtime = "edge";

function buildUpstreamUrl(owner: string, slug: string, path: string[]) {
  const base = `https://${owner}.github.io/${slug}`;
  const joined = (path && path.length ? path.join("/") : "").replace(/^\/+/, "");
  const url = new URL(base + "/" + joined);
  if (!joined || joined.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/?$/, "/index.html");
  }
  return url.toString();
}

async function proxy(method: string, _req: Request, params: { slug: string; path?: string[] }) {
  const owner = process.env.NEXT_PUBLIC_MICROS_OWNER || "velcrafting";
  const upstreamUrl = buildUpstreamUrl(owner, params.slug, params.path || []);
  const upstream = await fetch(upstreamUrl, {
    method,
    headers: { "User-Agent": "velcrafting-portfolio-proxy" },
    cache: "force-cache",
    redirect: "follow",
  });
  const headers = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "expires",
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: Request, ctx: { params: { slug: string; path?: string[] } }) {
  return proxy("GET", req, ctx.params);
}

export async function HEAD(req: Request, ctx: { params: { slug: string; path?: string[] } }) {
  return proxy("HEAD", req, ctx.params);
}

