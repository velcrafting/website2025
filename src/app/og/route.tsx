/** @jsxImportSource react */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "Steven Pajewski";
  const subtitle = searchParams.get("subtitle") || "";
  const image = searchParams.get("image");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0B0F19 0%, #111827 50%, #0B0F19 100%)",
          color: "white",
          padding: 64,
          position: "relative",
          fontFamily: "ui-sans-serif, system-ui, Segoe UI, Roboto, Helvetica, Arial",
        }}
      >
        {image ? (
          <img
            src={image}
            alt=""            // ← decorative background image
            width={700}
            height={630}
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              opacity: 0.12,
              objectFit: "cover",
            }}
          />
        ) : null}

        <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 12 }}>
          stevenpajewski.com
        </div>
        <div style={{ fontSize: 60, lineHeight: 1.1, fontWeight: 800, maxWidth: 1000 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 32, fontWeight: 500, opacity: 0.9, marginTop: 16 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    ),
    { ...size }
  );
}
