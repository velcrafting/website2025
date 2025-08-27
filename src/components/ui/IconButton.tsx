// src/components/ui/IconButton.tsx
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
        "inline-flex size-10 items-center justify-center rounded-md",
        "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
        "dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
        className
      )}
      {...rest}
    >
      {children}
    </a>
  );
}