// lib/og-card.tsx
export type OgCardProps = {
  page?: string;                    // e.g., "Writing"
  name?: string;                    // "Steven Pajewski"
  business?: string;                // "velcrafting.com"
  tagline?: string;                 // your line
  logoDataUrl?: string | null;      // optional inline SVG/PNG as data URL
};

export function OgCard({
  page = "Page",
  name = "Steven Pajewski",
  business = "velcrafting.com",
  tagline = "Turning complexity into clarity across AI, Web3 & community.",
  logoDataUrl = null,
}: OgCardProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 64,
        background:
          "linear-gradient(135deg, #0b1220 0%, #101826 55%, #0b1220 100%)",
        color: "white",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
        position: "relative",
      }}
    >
      {/* eyebrow */}
      <div style={{ opacity: 0.75, fontSize: 28, marginBottom: 10 }}>
        {business} · {page}
      </div>

      {/* main title */}
      <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>
        {name}
      </div>

      {/* tagline */}
      <div style={{ marginTop: 16, fontSize: 34, opacity: 0.92, maxWidth: 900 }}>
        {tagline}
      </div>

      {/* corner badge */}
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
        {logoDataUrl ? (
          <img
            src={logoDataUrl}
            width={44}
            height={44}
            style={{ display: "block" }}
          />
        ) : null}
        <div style={{ fontSize: 24, letterSpacing: 0.2 }}>Velcrafting</div>
      </div>
    </div>
  );
}
