"use client";

import clsx from "clsx";
import type { ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & { alt: string };

export default function ContentImage({ className, alt, ...rest }: Props) {
  return (
    <img
      alt={alt}
      {...rest}
      className={clsx(
        "my-4 w-full rounded-xl border border-neutral-800 shadow-sm",
        className
      )}
    />
  );
}
