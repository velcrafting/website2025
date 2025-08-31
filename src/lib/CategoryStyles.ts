// src/lib/categoryStyles.ts
export const categoryStyles = {
  labs: {
    gradient: "bg-gradient-to-br from-cyan-600 to-teal-900",
    ring: "ring-cyan-400/40",
    text: "text-cyan-200",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-200",
  },
  writing: {
    gradient: "bg-gradient-to-br from-amber-500 to-orange-900",
    ring: "ring-amber-400/40",
    text: "text-amber-100",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-100",
  },
  projects: {
    gradient: "bg-gradient-to-br from-indigo-600 to-blue-900",
    ring: "ring-indigo-400/40",
    text: "text-indigo-100",
    badgeBg: "bg-indigo-500/15",
    badgeText: "text-indigo-100",
  },
} as const;

export type CategoryKey = keyof typeof categoryStyles;