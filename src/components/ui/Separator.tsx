import clsx from "clsx";

type Props = {
  variant?: "neutral" | "accent" | "gradient";
  className?: string;
  accentClass?: string; // e.g. "from-emerald-400/70 via-emerald-300/40 to-emerald-400/70"
  fadeEdges?: boolean;
};

export default function Separator({
  variant = "accent",
  className,
  accentClass = "from-emerald-400/70 via-emerald-300/40 to-emerald-400/70",
  fadeEdges = true,
}: Props) {
  const base = "h-px w-full";
  const fade = fadeEdges
    ? "[mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]"
    : "";

  if (variant === "neutral") {
    return (
      <div
        role="separator"
        aria-hidden="true"
        className={clsx("mb-2", base, "bg-neutral-800", className)}
      />
    );
  }

  if (variant === "gradient") {
    return (
      <div
        role="separator"
        aria-hidden="true"
        className={clsx("mb-2", base, "bg-gradient-to-r", accentClass, fade, className)}
      />
    );
  }

  // accent (solid)
  return (
    <div
      role="separator"
      aria-hidden="true"
      className={clsx("mb-2", base, "bg-emerald-400/60", fade, className)}
    />
  );
}
