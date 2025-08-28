// src/components/ui/GradientIcon.tsx
"use client";
import * as React from "react";
import clsx from "clsx";

type GradientIconProps = {
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  className?: string;
  animateOnHover?: boolean; // default: true
};

export default function GradientIcon({ icon, className, animateOnHover = true }: GradientIconProps) {
  const uid = React.useId().replace(/:/g, ""); // clean id for url(#...)
  const [hovered, setHovered] = React.useState(false);

  // Safely materialize children and ensure they have stable keys
  const childrenArray = React.Children.toArray(icon.props.children) as React.ReactNode[];

  // IMPORTANT: flatten children + defs into a single array so every child has a key.
  // Using a Fragment with a nested array can trigger the React key warning in ForwardRef icons.
  const withDefsChildren = [
    ...childrenArray,
    (
      <defs key="defs">
        <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="25%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="75%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    ),
  ];

  const svg = React.cloneElement(icon, {
    className: clsx(
      icon.props.className,
      className,
      animateOnHover && hovered && "animate-[huerotate_2s_linear_infinite]"
    ),
    // Use CSS var to swap stroke from white to gradient on hover
    style: { ...(icon.props.style || {}), stroke: "var(--icon-stroke, currentColor)" },
    children: withDefsChildren,
  });

  type VarStyle = React.CSSProperties & { [key: string]: string | number | undefined };
  const wrapperStyle: VarStyle = { ["--icon-stroke"]: hovered ? `url(#${uid})` : "currentColor" };

  return (
    <span
      className={clsx("relative inline-flex")}
      style={wrapperStyle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {svg}
    </span>
  );
}
