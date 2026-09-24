import { ImageResponse } from "next/og";
import { loadOgAssets } from "./utils";

export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

export async function createBusinessCardImage(origin: string) {
  const { avatar, logo } = await loadOgAssets(origin);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          background: "linear-gradient(135deg,#eae5d8 0%,#f4f0e6 56%,#e3dce6 100%)",
          color: "#2f2c32",
          fontFamily: "ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 22,
            border: "1px solid #bbb3a5",
            borderRadius: 18,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            padding: "42px 76px",
            textAlign: "center",
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              alt=""
              width={84}
              height={84}
              style={{ borderRadius: 9999, objectFit: "cover", marginBottom: 9 }}
            />
          ) : null}
          <div style={{ fontFamily: "Georgia,serif", fontSize: 48, fontWeight: 600, lineHeight: 1.08 }}>
            Steven Pajewski
          </div>
          <div style={{ marginTop: 5, color: "#5b4566", fontFamily: "Georgia,serif", fontSize: 25, fontStyle: "italic" }}>
            You can call me vel
          </div>
          <div style={{ width: 72, height: 2, background: "#3c5749", marginTop: 17, marginBottom: 15 }} />
          <div style={{ fontSize: 23, fontWeight: 600 }}>
            Things I’m making. Ideas I’m researching. Services I offer.
          </div>
          <div style={{ maxWidth: 950, marginTop: 7, color: "#625c65", fontSize: 20, lineHeight: 1.28 }}>
            Helping you understand, identify opportunities for, and implement AI in your business.
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 43,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            color: "#392f3d",
          }}
        >
          {logo ? <img src={logo} alt="" width={27} height={27} style={{ borderRadius: 5 }} /> : null}
          <span style={{ fontSize: 19, letterSpacing: 1.2 }}>Velcrafting</span>
        </div>
      </div>
    ),
    SHARE_CARD_SIZE,
  );
}
