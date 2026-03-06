"use client";
import { useState } from "react";

export default function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-white px-2 py-1 text-xs shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {text}
        </span>
      )}
    </span>
  );
}