// src/components/ui/Button.tsx
import clsx from "clsx";

type Variant = "accent" | "default" | "outline" | "ghost";
type Size = "sm" | "md" | "lg";

export function buttonClasses({
  variant = "default",
  size = "md",
  className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return clsx(
    // base
    "inline-flex items-center justify-center rounded-full font-medium text-sm transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-purple-400",
    // sizes
    size === "sm" && "px-3 py-1.5",
    size === "md" && "px-4 py-2",
    size === "lg" && "px-5 py-2.5",
    // variants
    variant === "default" &&
      "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
    variant === "outline" &&
      "border border-white/20 bg-white/5 text-white hover:bg-white/10",
    variant === "ghost" &&
      "text-white/90 hover:bg-white/10",
    variant === "accent" &&
      "text-white bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 shadow-md hover:shadow-lg",
    className
  );
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export default function Button({
  variant = "default",
  size = "md",
  className,
  ...props
}: Props) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
