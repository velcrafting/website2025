// Presentational MDX component. Rendered on the server by the
// non-executable body renderer, so it must not be a client component.
// Concept 03: token border, radius and caption colour. The native/optimised
// image split, `sizes` and `priority` behaviour are unchanged.
import Image from "next/image";
import clsx from "clsx";

type Props = {
  src: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
};

export default function Figure({
  src,
  alt,
  caption,
  width,
  height,
  priority,
  className,
}: Props) {
  const useNative = !width || !height;
  return (
    <figure className={clsx("my-[var(--space-5)]", className)}>
      {useNative ? (
        <img
          src={src}
          alt={alt}
          className="w-full rounded-[var(--radius-surface)] border border-rule"
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(min-width: 1024px) 860px, 100vw"
          priority={priority}
          className="h-auto w-full rounded-[var(--radius-surface)] border border-rule"
        />
      )}
      {caption ? (
        <figcaption className="meta mt-[var(--space-2)] text-center">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
