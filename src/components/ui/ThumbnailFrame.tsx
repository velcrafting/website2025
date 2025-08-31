// src/components/ThumbnailFrame.tsx
import { categoryStyles } from "@/lib/CategoryStyles";
import type { CategoryKey } from "@/lib/CategoryStyles";
import clsx from "clsx";

type Props = {
  category: CategoryKey;
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode; // place the character image here
};

export default function ThumbnailFrame({ category, title, subtitle, className, children }: Props) {
  const s = categoryStyles[category];

  return (
    <div
      className={clsx(
        "relative aspect-[16/9] overflow-hidden rounded-2xl ring-1 p-4",
        s.gradient,
        s.ring,
        className
      )}
    >
      {/* Left text rail */}
      <div className="absolute inset-y-0 left-0 w-[42%] flex flex-col justify-center gap-2 p-6">
        <span className={clsx("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium", s.badgeBg, s.badgeText)}>
          {category.toUpperCase()}
        </span>
        <h3 className={clsx("text-xl md:text-2xl font-semibold leading-tight", s.text)}>{title}</h3>
        {subtitle ? <p className="text-white/80 text-sm">{subtitle}</p> : null}
      </div>

      {/* Right visual zone for character art */}
      <div className="absolute inset-y-0 right-0 w-[58%] flex items-end justify-end p-3">
        <div className="h-full w-full pointer-events-none select-none">{children}</div>
      </div>
    </div>
  );
}
