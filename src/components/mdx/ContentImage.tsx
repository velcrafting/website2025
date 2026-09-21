// Presentational MDX component. Rendered on the server by the
// non-executable body renderer, so it must not be a client component.
// Concept 03: token border and radius, no decorative shadow.
import clsx from "clsx";
import type { ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & { alt: string };

export default function ContentImage({ className, alt, ...rest }: Props) {
  return (
    <img
      alt={alt}
      {...rest}
      className={clsx(
        "my-[var(--space-4)] w-full rounded-[var(--radius-surface)] border border-rule",
        className
      )}
    />
  );
}
