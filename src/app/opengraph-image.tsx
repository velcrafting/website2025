// app/opengraph-image.tsx
import { ImageResponse } from "next/og";
import { OgCard } from "../lib/og-card";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function loadLogoDataUrl() {
  try {
    const svgText = await fetch(
      new URL("../public/logo.svg", import.meta.url)
    ).then((r) => r.text());
    const encoded = encodeURIComponent(svgText)
      .replace(/%0A/g, "")
      .replace(/%20/g, " ");
    return `data:image/svg+xml;utf8,${encoded}`;
  } catch {
    return null;
  }
}

export default async function OG() {
  const logoDataUrl = await loadLogoDataUrl();

  return new ImageResponse(
    <OgCard
      page="Home"
      name="Steven Pajewski"
      business="velcrafting.com"
      tagline="Turning complexity into clarity across AI, Web3 & community."
      logoDataUrl={logoDataUrl}
    />,
    size
  );
}
