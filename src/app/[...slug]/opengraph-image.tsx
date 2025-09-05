import { ImageResponse } from "next/og";
import { loadOgAssets } from "../_og/utils";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function toTitleCase(s: string) {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export default async function OG({ params }: { params: { slug?: string[] } }) {
  const page = params.slug?.[0] ? toTitleCase(params.slug[0]) : "Home";
  const { logo, avatar } = await loadOgAssets();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          background: "linear-gradient(135deg,#0b1220 0%,#101826 55%,#0b1220 100%)",
          color: "white",
          fontFamily: "ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: 64,
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: 28, opacity: 0.75, marginBottom: 10 }}>
            velcrafting.com · {page}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {avatar ? (
              <img
                src={avatar}
                alt=""
                width={96}
                height={96}
                style={{ display: "block", borderRadius: 9999, objectFit: "cover" }}
              />
            ) : null}
            <div style={{ display: "flex", fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
              Steven Pajewski
            </div>
          </div>

          <div style={{ display: "flex", marginTop: 16, fontSize: 34, opacity: 0.92, maxWidth: 900 }}>
            Turning complexity into clarity across AI, Web3 & community.
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            right: 64,
            bottom: 52,
            display: "flex",
            alignItems: "center",
            gap: 14,
            opacity: 0.9,
          }}
        >
          {logo ? (
            <img src={logo} width={44} height={44} alt="" style={{ display: "block", borderRadius: 8 }} />
          ) : null}
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 0.2 }}>Velcrafting</div>
        </div>
      </div>
    ),
    size
  );
}
