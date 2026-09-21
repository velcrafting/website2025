// Presentational MDX component. Rendered on the server by the
// non-executable body renderer, so it must not be a client component.
//
// Concept 03: token surfaces and functional state colours. The three callout
// tones stay visually distinct, but they now use the palette's own semantic
// colours instead of Tailwind's emerald/amber/sky, and the heavy rounding is
// reduced to the shared 4–6px radius.
type CalloutType = "note" | "tip" | "warning";

const TONE_BORDER: Record<CalloutType, string> = {
  note: "var(--rule)",
  tip: "color-mix(in oklab, var(--success-ink) 45%, transparent)",
  warning: "color-mix(in oklab, var(--warn-ink) 55%, transparent)",
};

const TONE_LABEL: Record<CalloutType, string> = {
  note: "Note",
  tip: "Tip",
  warning: "Warning",
};

export default function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="my-[var(--space-4)] rounded-[var(--radius-surface)] border p-[var(--space-4)]"
      style={{ borderColor: TONE_BORDER[type] }}
    >
      {/*
        The tone is also stated in text, so it is not carried by colour alone.
      */}
      <p className="meta mb-[var(--space-1)] uppercase tracking-wide">
        {TONE_LABEL[type]}
        {title ? <> · {title}</> : null}
      </p>
      <div className="text-ink">{children}</div>
    </div>
  );
}
