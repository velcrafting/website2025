// src/components/ui/MetricTile.tsx
"use client";

import { motion } from "framer-motion";
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

  return (
        <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20% 0px -20% 0px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Card className="text-center">
        <div className="text-3xl font-semibold tracking-tight">
          {parsed.kind === "numeric" ? (
            <>
              <CountUp end={parsed.num} duration={1.6} separator="," />
              {parsed.suffix}
            </>
          ) : (
            parsed.display
          )}
        </div>
        <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{label}</div>
        {sublabel ? (
          <div className="mt-1 text-xs italic text-neutral-500 dark:text-neutral-500">{sublabel}</div>
        ) : null}
      </Card>
    </motion.div>
  );
}
