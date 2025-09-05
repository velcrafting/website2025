import { ImageResponse } from "next/og";
import { loadLogoDataUrl } from "./_og/utils";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Card({
  page,
  name,
  business,
  tagline,
  logo,
}: {
  page: string;
  name: string;
  business: string;
  tagline: string;
  logo: string | null;
}) {
  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      justifyContent: "center", padding: 64, position: "relative",
      background: "linear-gradient(135deg,#0b1220 0%,#101826 55%,#0b1220 100%)",
      color: "white", fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto",
    }}>
      <div style={{ opacity: 0.75, fontSize: 28, marginBottom: 10 }}>
        {business} · {page}
      </div>
      <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
      <div style={{ marginTop: 16, fontSize: 34, opacity: 0.92, maxWidth: 900 }}>{tagline}</div>
      <div style={{ position: "absolute", right: 64, bottom: 52, display: "flex", gap: 14, alignItems: "center", opacity: 0.9 }}>
        {logo ? <img src={logo} width={44} height={44} style={{ display: "block" }} /> : null}
        <div style={{ fontSize: 24, letterSpacing: 0.2 }}>Velcrafting</div>
      </div>
    </div>
  );
}

export default async function OG() {
  const logo = await loadLogoDataUrl();
  return new ImageResponse(
    <Card
      page="Home"
      name="Steven Pajewski"
      business="velcrafting.com"
      tagline="Turning complexity into clarity across AI, Web3 & community."
      logo={logo}
    />,
    size
  );
}
