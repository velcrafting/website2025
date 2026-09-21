// src/components/ui/Badge.tsx
//
// shadcn-backed shared status/tag treatment (docs/2026-refresh.md §4, §5).
//
// This replaces the previous single-style badge, which used the retired neutral
// palette and gave the projects page nothing to distinguish states with. Variants
// are the shared API: a caller picks a meaning, not a colour.
//
// The existing `children`-only call site keeps working, because `variant`
// defaults to `default`.
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-chip)] border px-[var(--space-2)] py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        /** Quiet metadata: tags, counts, dates. */
        default: "border-rule/60 text-muted",
        /** Identity accent: the primary project/status marker. */
        accent: "border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]",
        /** Selected editorial emphasis (violet), for links and featured state. Uses the
            deeper violet step so a 12px label on the lavender tint clears 4.5:1 in light. */
        link: "border-[var(--link)]/40 bg-[var(--selection)] text-[var(--link-strong)]",
        /** Caution: scheduled or pending work. */
        warn: "border-[var(--warn-ink)]/40 bg-warn-fill text-[var(--warn-ink)]",
        /** Error and destructive state. */
        danger: "border-[var(--danger-ink)]/35 text-[var(--danger-ink)]",
        /**
         * Confirmed-good state (published, live, verified). A restrained on-brand tint
         * rather than a saturated pill.
         */
        success:
          "border-[var(--success-ink)]/40 bg-[var(--success-ink)]/12 text-[var(--success-ink)]",
        /**
         * Quiet, non-committal state: context labels, qualifiers, "not hosted" notes.
         * Tinted so it is legible as a state rather than reading as plain text.
         */
        neutral:
          "border-[var(--violet)]/35 bg-[var(--lavender-wash)] text-[var(--ink)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

type Props = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export default function Badge({ className, variant, ...props }: Props) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
