// app/[...slug]/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { OgCard } from "../../lib/og-card";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Load /public/logo.svg once, inline as a data URL.
// Works at the edge without Buffer: use utf-8 data: URL.
async function loadLogoDataUrl() {
  try {
    const svgText = await fetch(
      new URL("../../public/logo.svg", import.meta.url)
    ).then((r) => r.text());
    const encoded = encodeURIComponent(svgText)
      // keep SVG cleaner in data URL
      .replace(/%0A/g, "")
      .replace(/%20/g, " ");
    return `data:image/svg+xml;utf8,${encoded}`;
  } catch {
    return null;
  }
}

function toTitleCase(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function OG({
  params,
}: {
  params: { slug?: string[] };
}) {
  const first = params.slug?.[0] ?? "";         // e.g., "writing"
  const page = first ? toTitleCase(first) : "Home";

  const logoDataUrl = await loadLogoDataUrl();

  return new ImageResponse(
    <OgCard
      page={page}
      name="Steven Pajewski"
      business="velcrafting.com"
      tagline="Turning complexity into clarity across AI, Web3 & community."
      logoDataUrl={logoDataUrl}
    />,
    size
  );
}
