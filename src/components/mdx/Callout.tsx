"use client";

export default function Callout({
  type = "note",
  title,
  children,
}: {
  type?: "note" | "tip" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  const base = "rounded-xl border p-4 my-4";
  const tone =
    type === "tip"
      ? "border-emerald-500/30"
      : type === "warning"
      ? "border-amber-500/30"
      : "border-sky-500/30";

  return (
    <div className={`${base} ${tone}`}>
      {title && <div className="font-semibold mb-1">{title}</div>}
      <div className="text-sm text-neutral-300">{children}</div>
    </div>
  );
}
