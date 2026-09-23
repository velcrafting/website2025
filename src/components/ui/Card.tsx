// src/components/ui/Card.tsx
//
// Concept 03: this was the boxed-card component with a violet/blue radial bloom
// and heavy layered shadows — all retired by the design direction. It is now a
// shallow token surface: rules and whitespace do the grouping, the surface is the
// exception rather than the default grid.
//
// The prop API is unchanged (variant, hoverLift, className), so existing callers
// keep working. `hoverLift` still lifts, but the shadow stack is gone.
import clsx from "clsx";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  variant?: "elevated" | "soft" | "outline";
  hoverLift?: boolean;
};

export default function Card({
  children,
  className = "",
  variant = "elevated",
  hoverLift = true,
}: CardProps) {
  return (
    <div
      className={clsx(
        "relative mt-[var(--space-4)] rounded-[var(--radius-surface)] border p-[var(--space-5)] transition",
        "bg-surface text-ink",
        variant === "outline" && "border-rule",
        variant === "soft" && "border-rule",
        variant === "elevated" && "border-rule",
        hoverLift && "hover:-translate-y-[1px] hover:border-ink",
        className
      )}
    >
      {children}
    </div>
  );
}
