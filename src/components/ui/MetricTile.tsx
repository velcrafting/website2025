// src/components/ui/MetricTile.tsx
//
// Concept 03: token colours, and the entrance animation now respects
// prefers-reduced-motion (a scroll-triggered animation must not override a stated
// preference). The value parsing, the CountUp behaviour and the Card wrapper are
// unchanged.
"use client";

import { motion, useReducedMotion } from "framer-motion";
import CountUp from "react-countup";
import Card from "./Card";

type MetricTileProps = {
  value: string; // e.g., "70%", "1M+", "12.5K", "Global"
  label: string;
  sublabel?: string;
};

type ParsedNumeric = { kind: "numeric"; num: number; suffix: string }; // "70" + "%", "1" + "M+", "12500" + ""
type ParsedText = { kind: "text"; display: string };
type Parsed = ParsedNumeric | ParsedText;

function parseValue(raw: string): Parsed {
  const cleaned = raw.trim();
  // Try to parse numbers with optional K/M/B, keep visual suffixes like "+" or "%"
  // Examples matched: "70%", "1M+", "12.5K", "10", "2.3B"
  const m = cleaned.replace(/,/g, "").match(/^(\d+(?:\.\d+)?)([KMBkmb])?(\+|%)?$/);
  if (!m) return { kind: "text", display: cleaned };

  const base = parseFloat(m[1]);
  const mag = (m[2] || "").toUpperCase(); // K/M/B
  const trail = m[3] || ""; // "+" or "%"

  let num = base;
  if (mag === "K") num = base * 1_000;
  else if (mag === "M") num = base * 1_000_000;
  else if (mag === "B") num = base * 1_000_000_000;

  // Keep the human suffix visually. E.g., "M+" or "%"
  const suffix = `${mag}${trail}`;

  return { kind: "numeric", num, suffix };
}

export default function MetricTile({ value, label, sublabel }: MetricTileProps) {
  const parsed = parseValue(value);
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20% 0px -20% 0px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="text-center">
        <div className="text-3xl font-semibold tracking-tight text-ink">
          {parsed.kind === "numeric" ? (
            <>
              <CountUp end={parsed.num} duration={reduceMotion ? 0 : 1.6} separator="," />
              {parsed.suffix}
            </>
          ) : (
            parsed.display
          )}
        </div>
        <p className="meta mt-[var(--space-2)]">{label}</p>
        {sublabel ? (
          <p className="meta mt-[var(--space-1)] italic">{sublabel}</p>
        ) : null}
      </Card>
    </motion.div>
  );
}
