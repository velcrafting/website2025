import type { PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type Props = PropsWithChildren<{
  measure?: "wide" | "form";
  className?: string;
}>;

export default function Workspace({ children, measure = "wide", className }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full space-y-8 px-[var(--space-5)] py-[var(--space-7)]",
        measure === "wide" && "max-w-[var(--measure-index)]",
        measure === "form" && "max-w-[64rem]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceProse({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <div className={cn("max-w-[var(--measure-prose)]", className)}>{children}</div>;
}
