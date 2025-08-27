"use client";

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
    <figure className={clsx("my-6", className)}>
      {useNative ? (
        <img src={src} alt={alt} className="w-full rounded-xl border border-neutral-800" />
      ) : (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes="(min-width: 1024px) 860px, 100vw"
          priority={priority}
          className="h-auto w-full rounded-xl border border-neutral-800"
        />
      )}
      {caption ? (
        <figcaption className="mt-2 text-sm text-neutral-400 text-center">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
