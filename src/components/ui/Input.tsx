// src/components/ui/Input.tsx
//
// shadcn-backed shared Input (docs/2026-refresh.md §4).
//
// Appearance stays on the shared `.field` token class so inputs, selects and
// textareas across the contact form and the private editor keep measuring the
// same. Added here: an invalid state that the shared tokens already own
// (--danger-ink), so a form can mark a field without inventing a colour, and
// `cn` so a caller's layout classes merge instead of fighting.
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "field",
        "aria-[invalid=true]:border-[var(--danger-ink)]",
        className
      )}
      {...rest}
    />
  );
});

export default Input;
