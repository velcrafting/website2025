// src/components/ui/Button.tsx
//
// shadcn-backed shared Button (docs/2026-refresh.md §4).
//
// Behaviour comes from Radix Slot and variants from class-variance-authority —
// the shadcn structure — while appearance still resolves to the concept-03 token
// classes (.btn-primary / .btn-secondary) defined in globals.css. The public API
// is unchanged and `buttonClasses` is still exported, so existing callers keep
// working.
//
// `asChild` is the one added capability: it lets a link render as a button
// without copying button classes into the page, which is how the reading and
// contact surfaces previously styled anchors by hand.
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[var(--space-2)] font-medium text-sm transition",
  {
    variants: {
      variant: {
        // `accent` and `default` are the same visual treatment; both names are
        // kept because callers already use each.
        default: "btn-primary",
        accent: "btn-primary",
        outline: "btn-secondary",
        ghost: "min-h-[44px] text-ink hover:bg-paper-raised",
      },
      size: {
        // min-height comes from the .btn-* class, so touch targets stay >= 44px
        sm: "px-[var(--space-3)] py-[var(--space-1)]",
        md: "px-[var(--space-4)] py-[var(--space-2)]",
        lg: "px-[var(--space-5)] py-[var(--space-3)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

type Variant = "accent" | "default" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

/** Kept for callers that need the class string (for example a non-React href). */
export function buttonClasses({
  variant = "default",
  size = "md",
  className,
}: { variant?: Variant | null; size?: Size | null; className?: string } = {}) {
  return cn(buttonVariants({ variant, size }), className);
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render the single child element (for example a Link) with button styling. */
    asChild?: boolean;
  };

export default function Button({
  variant,
  size,
  className,
  asChild = false,
  ...props
}: Props) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={buttonClasses({ variant, size, className })} {...props} />
  );
}
