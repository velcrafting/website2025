// src/components/ui/GradientIcon.tsx
//
// Concept 03: the animated rainbow gradient is retired. The previous version
// painted every icon with a five-stop rainbow linear gradient and ran a
// colour-rotating animation on hover — both are part of the rejected look, and the
// rotation is exactly the kind of decorative motion the design principles rule out.
//
// The component is kept because callers pass icons through it, but it is now a
// restrained wrapper: currentColor by default, a quiet colour shift on hover, and
// the same prop API (icon, className, animateOnHover) so nothing else changes.
//
// `animateOnHover` is accepted and intentionally ignored rather than removed, so
// existing call sites keep compiling; the movement it used to trigger is not part
// of the approved direction.

import * as React from "react";
import clsx from "clsx";

type GradientIconProps = {
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  className?: string;
  animateOnHover?: boolean;
};

export default function GradientIcon({ icon, className }: GradientIconProps) {
  const svg = React.cloneElement(icon, {
    className: clsx(icon.props.className, className),
    // Inherit the surrounding text colour; no gradient, no animation.
    style: { ...(icon.props.style || {}), stroke: "currentColor" },
  });

  return <span className="relative inline-flex">{svg}</span>;
}
