// src/components/ui/Card.tsx
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
        "relative rounded-2xl border p-5 transition mt-4",
  // base tones
  "bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100",
        // borders
        variant === "outline" && "border-neutral-200 dark:border-neutral-800 shadow-sm",
        variant === "soft" &&
          "border-neutral-100/70 dark:border-neutral-800/70 shadow-md shadow-black/10 dark:shadow-black/30",
        variant === "elevated" &&
          "border-neutral-100/60 dark:border-neutral-800/80 shadow-lg shadow-black/10 dark:shadow-black/40",
        // subtle tinted backdrop and gradient bloom
        variant !== "outline" &&
          "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(40%_60%_at_10%_-10%,rgba(147,51,234,0.06),transparent_60%),radial-gradient(40%_60%_at_110%_120%,rgba(59,130,246,0.05),transparent_60%)]",
        hoverLift && "hover:-translate-y-[2px] hover:shadow-xl",
        className
      )}
    >
      {children}
    </div>
  );
}
