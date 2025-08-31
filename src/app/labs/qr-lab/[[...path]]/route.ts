// Proxies the QR Lab micro-site hosted on GitHub Pages so that
// client navigations inside the Next.js app don't hit the dynamic
// `[slug]` route and 404. This handler takes precedence for the
// `/labs/qr-lab` path and any nested assets.

const ORIGIN = "https://velcrafting.github.io/qr-lab";

function buildUpstreamUrl(path: string[]) {
  // Join segments and map empty or trailing slash to index.html
  const joined = (path && path.length ? path.join("/") : "").replace(/^\/+/, "");
  const url = new URL(ORIGIN + "/" + joined);
  if (!joined || joined.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/?$/, "/index.html");
  }
  return url.toString();
}

async function proxy(method: string, _req: Request, params: { path?: string[] }) {
  const upstreamUrl = buildUpstreamUrl(params.path || []);
  const upstream = await fetch(upstreamUrl, {
    // Pass through method; we only implement GET/HEAD below.
    method,
    // Let the CDN cache static assets; GitHub Pages sends Cache-Control headers.
    // Next will pass these through.
    headers: {
      // Identify proxy requests without leaking internal headers
      "User-Agent": "velcrafting-portfolio-proxy",
    },
    // Revalidate based on upstream headers
    cache: "force-cache",
    // Prevent Next from trying to decode as HTML; we stream the body as-is.
    redirect: "follow",
  });

  // Copy through a limited set of safe headers
  const headers = new Headers();
  const copyHeaders = [
    "content-type",
    "content-length",
    "cache-control",
    "etag",
    "last-modified",
    "expires",
    "x-github-request-id",
  ];
  for (const h of copyHeaders) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(req: Request, ctx: { params: { path?: string[] } }) {
  return proxy("GET", req, ctx.params);
}

export async function HEAD(req: Request, ctx: { params: { path?: string[] } }) {
  return proxy("HEAD", req, ctx.params);
}

