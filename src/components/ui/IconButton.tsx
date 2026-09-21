// src/components/ui/IconButton.tsx
//
// Concept 03: token colours and the accent focus ring. The API is unchanged.
import * as React from "react";
import clsx from "clsx";

type IconButtonProps = {
  href: string;
  label: string;                  // for aria-label and default title
  children: React.ReactNode;
  newTab?: boolean;               // default: true
  className?: string;
} & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children" | "className" | "aria-label" | "target" | "rel"
>;

export default function IconButton({
  href,
  label,
  children,
  newTab = true,
  className,
  title,
  ...rest
}: IconButtonProps) {
  const isExternal =
    /^https?:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");

  const target = newTab ? "_blank" : undefined;

  const rel = newTab
    ? ["noopener", "noreferrer", isExternal ? "external" : null]
        .filter(Boolean)
        .join(" ")
    : undefined;

  return (
    <a
      href={href}
      target={target}
      rel={rel}
      aria-label={label}
      title={title ?? label}
      className={clsx(
        // 44px minimum target for a compact control.
        "inline-flex size-11 items-center justify-center rounded-[var(--radius-chip)]",
        "text-ink hover:bg-paper-raised",
        "transition-colors duration-[var(--motion-base)]",
        className
      )}
      {...rest}
    >
      {children}
    </a>
  );
}
