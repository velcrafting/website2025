/** @jsxImportSource react */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PROD = process.env.NODE_ENV === "production";
// Add hosts here if you want to allow external images
const ALLOW_HOSTS: string[] = []; // e.g. ["images.unsplash.com", "res.cloudinary.com"]

function isPrivateHost(host: string) {
  // IPv4 private + loopback + link-local
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host) ||
    /^169\.254\.\d+\.\d+$/.test(host)
  ) return true;

  // IPv6 loopback and common private scopes
  if (
    host === "::1" ||
    /^fe80:/i.test(host) ||   // link-local IPv6
    /^fc00:/i.test(host) ||   // unique local
    /^fd[0-9a-f]{2}:/i.test(host)
  ) return true;

  return false;
}

function looksPublicHostname(host: string) {
  // crude but effective: prod should not accept single-label hosts like "corp"
  return host.includes(".");
}

function resolveSafeImageUrl(input: string | null, origin: string): string | null {
  if (!input) return null;
  try {
    const u = new URL(input, origin); // supports relative URLs

    // Only http/https
    if (!/^https?:$/.test(u.protocol)) return null;

    // Rewrite private or localhost to the deployment origin
    if (isPrivateHost(u.hostname)) {
      const o = new URL(origin);
      u.protocol = o.protocol;
      u.host = o.host; // keep path and query
    }

    // In prod, reject bare hostnames
    if (PROD && !looksPublicHostname(u.hostname)) return null;

    // Optional allowlist: only allow your site and listed hosts
    const originHost = new URL(origin).host;
    if (ALLOW_HOSTS.length > 0 && u.host !== originHost && !ALLOW_HOSTS.includes(u.hostname)) {
      return null;
    }

    // Prefer https in prod if external
    if (PROD && u.protocol === "http:" && u.host !== originHost) {
      u.protocol = "https:";
    }

    return u.toString();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;

  const title = url.searchParams.get("title") || "Steven Pajewski";
  const subtitle = url.searchParams.get("subtitle") || "";
  const safeImage = resolveSafeImageUrl(url.searchParams.get("image"), origin);

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "center", background: "linear-gradient(135deg,#0B0F19 0%,#111827 50%,#0B0F19 100%)",
        color: "white", padding: 64, position: "relative",
        fontFamily: "ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial"
      }}>
        {safeImage ? (
          <img
            src={safeImage}
            alt=""
            width={700}
            height={630}
            style={{ position: "absolute", right: 0, top: 0, opacity: 0.12, objectFit: "cover" }}
          />
        ) : null}
        <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 12 }}>stevenpajewski.com</div>
        <div style={{ fontSize: 60, lineHeight: 1.1, fontWeight: 800, maxWidth: 1000 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 32, fontWeight: 500, opacity: 0.9, marginTop: 16 }}>{subtitle}</div> : null}
      </div>
    ),
    { ...size }
  );
}
