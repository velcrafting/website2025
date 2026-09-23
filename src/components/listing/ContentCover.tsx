// src/components/listing/ContentCover.tsx
//
// The shared cover treatment for list rows (docs/2026-refresh.md §3, §5).
//
// Why this exists: the previous per-tag GRADIENT placeholder was retired with the
// rest of concept 02, which left every post without a hero rendering as bare text —
// a real loss of visual presence that Steven reported as "the blog lost its images".
// Restoring the gradient placeholder was not an option (retired direction) and
// inventing product screenshots would be dishonest.
//
// The rule this implements: "Use real assets where available. For missing imagery,
// propose a reusable branded illustration/cover treatment tied to the topic and
// identify illustration as illustration."
//
// So:
//   - a real hero wins, always, and is never replaced by decoration;
//   - otherwise a deterministic, token-based ruled panel is drawn;
//   - the panel is labelled "Illustration" in the interface and exposed to assistive
//     technology as an image with that label — it never claims to be a screenshot of
//     the product;
//   - the variation between covers is derived from the title, so it is stable across
//     renders (no hydration mismatch) and different posts do not look identical.
import Image from "next/image";

type Props = {
  title: string;
  hero?: string;
  /** First tag, used as the panel's topic label. */
  topic?: string;
  /** Position in the list, shown as an index mark. */
  index?: number;
  /** Caller-controlled responsive sizes for the real-image path. */
  sizes?: string;
  className?: string;
  /**
   * Where the cover sits.
   *
   *   standalone (default) — its own framed block: rounded, bordered on all sides.
   *                         Use when the cover is a sibling of the text (e.g. a strip).
   *   card-top            — the top region OF a containing card: square, full-bleed, with
   *                         only a bottom rule, so the card owns the outer frame and the
   *                         cover never becomes a competing nested frame.
   *
   * The variant exists so the frame is decided in one place instead of being neutralised
   * from the call site with conflicting utility classes.
   */
  variant?: "standalone" | "card-top";
  /** Whether to render the small topic figure in an illustration panel. */
  showFigure?: boolean;
  /** Whether to render the small topic label in an illustration panel. */
  showTopic?: boolean;
  /**
   * Optional content rendered INSIDE the panel.
   *
   * The listing card uses this so the title occupies the cover, instead of the cover being a tall
   * empty block with the title sitting underneath it (reported as looking half-implemented).
   *
   * When children are present the panel is no longer exposed as an image, because a role="img"
   * hides everything inside it — including that heading — from assistive technology. The visible
   * "Illustration" label stays either way, so the panel still never claims to be a screenshot.
   */
  children?: React.ReactNode;
};

/** Stable, deterministic hash so a cover never changes between renders. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * The small hairline figure drawn in a cover panel.
 *
 * WHY. Every cover without a real image drew the same ruled panel, so a page of them read as one
 * repeated placeholder rather than as distinct destinations (Steven, 2026-09-17: the surfaces should
 * read as "purposeful destination-specific work, not repeated generic notebook-line placeholders").
 *
 * WHAT THIS IS NOT. It is not artwork and it is not a screenshot. It is a hairline registration mark
 * in the site's own language — token colours, 1px strokes, no fill, no gradient — chosen
 * deterministically from the topic so two different subjects do not look identical and the same
 * subject never changes between renders. Real imagery still wins wherever a hero exists; this only
 * ever fills the gap the ruled panel already filled.
 *
 * It stays deliberately small and muted: it differentiates covers without becoming decoration that
 * competes with the title.
 */
type CoverFigure = "tools" | "writing" | "work" | "profile" | "community" | "notes";

/** Topic word → figure. Unrecognised topics fall back to the plain notebook mark, never a guess. */
export function figureFor(topic?: string): CoverFigure {
  const t = (topic ?? "").trim().toLowerCase();
  if (!t) return "notes";
  if (/community|discord|newsletter|join|people|meet/.test(t)) return "community";
  if (/resume|hiring|cv|career|profile|about|generalist|consult|marketing/.test(t)) return "profile";
  if (/tool|mcp|api|sdk|cli|electron|typescript|javascript|python|rust|react|qr/.test(t)) return "tools";
  if (/writ|note|blog|essay|draft|journal|communication|fud|research/.test(t)) return "writing";
  if (/agent|model|system|project|work|case|data|infra|bench|sim/.test(t)) return "work";
  return "notes";
}

/**
 * The figure's own paths, on a 44×28 grid, stroked in `currentColor`.
 *
 * Kept as literal JSX per case rather than generated geometry: a figure is a drawing decision, and a
 * reader should be able to see each one without running the code.
 */
function Figure({ figure }: { figure: CoverFigure }) {
  const common = {
    viewBox: "0 0 44 28",
    width: 44,
    height: 28,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1,
  } as const;

  switch (figure) {
    case "tools":
      // A bracketed working bar with two registration ticks.
      return (
        <svg {...common}>
          <rect x="4.5" y="9.5" width="35" height="9" rx="1" />
          <path d="M11.5 9.5v9M32.5 9.5v9" />
          <path d="M4.5 5.5v16M39.5 5.5v16" />
        </svg>
      );
    case "writing":
      // Ruled lines shortening as they fall, with a nib mark.
      return (
        <svg {...common}>
          <path d="M5.5 6.5h33M5.5 12.5h33M5.5 18.5h21" />
          <path d="M30.5 22.5l4-4" />
        </svg>
      );
    case "work":
      // A small node graph: three vertices, two edges.
      return (
        <svg {...common}>
          <circle cx="8.5" cy="8.5" r="3.5" />
          <circle cx="35.5" cy="13.5" r="3.5" />
          <circle cx="17.5" cy="22.5" r="3.5" />
          <path d="M11.8 10.1l20.4 2.6M11 11.6l4.8 9" />
        </svg>
      );
    case "profile":
      // A portrait frame: shoulders and a head.
      return (
        <svg {...common}>
          <rect x="6.5" y="3.5" width="31" height="21" rx="2" />
          <circle cx="22" cy="11.5" r="3.5" />
          <path d="M15.5 21.5c1.4-3.2 4-4.6 6.5-4.6s5.1 1.4 6.5 4.6" />
        </svg>
      );
    case "community":
      // Two circles meeting, with the shared point marked.
      return (
        <svg {...common}>
          <circle cx="16.5" cy="14" r="7.5" />
          <circle cx="27.5" cy="14" r="7.5" />
          <path d="M22 8.4v11.2" />
        </svg>
      );
    default:
      // The plain notebook mark: the language the other figures are drawn in.
      return (
        <svg {...common}>
          <path d="M5.5 8.5h33M5.5 14.5h33M5.5 20.5h24" />
          <path d="M5.5 8.5v12" />
        </svg>
      );
  }
}

export default function ContentCover({
  title,
  hero,
  topic,
  index,
  sizes = "(min-width: 1024px) 360px, 100vw",
  className = "",
  variant = "standalone",
  showFigure = true,
  showTopic = true,
  children,
}: Props) {
  const isCardTop = variant === "card-top";
  // Aspect ratio rather than a fixed height in a card, so the top region scales with the
  // column and image / no-image cards keep identical geometry.
  const box = `${
    isCardTop
      ? "block aspect-[16/9] w-full overflow-hidden"
      : "block h-32 w-full overflow-hidden rounded-[var(--radius-surface)]"
  } ${className}`;
  const illustrationFrame = isCardTop
    ? "border-b border-rule bg-[var(--surface)]"
    : "border border-rule bg-[var(--surface)]";

  if (hero) {
    const isSvg = hero.toLowerCase().endsWith(".svg");
    return (
      <span className={box}>
        {isSvg ? (
          // SVG heroes are served as-is: next/image would not optimise them.
          <img src={hero} alt={title} className="h-full w-full object-cover" />
        ) : (
          <Image
            src={hero}
            alt={title}
            width={720}
            height={405}
            sizes={sizes}
            className="h-full w-full object-cover"
          />
        )}
      </span>
    );
  }

  // Deterministic composition: which side the accent block sits on, and how many
  // rules the panel carries.
  const seed = seedFrom(title);
  const accentRight = seed % 2 === 0;
  const ruleCount = 3 + (seed % 3);
  // Deterministic from the topic, so a cover never changes between renders.
  const figure = figureFor(topic);

  return (
    <span
      role={children ? undefined : "img"}
      aria-label={children ? undefined : `${title} — illustration`}
      className={`${box} relative ${illustrationFrame}`}
    >
      {/* Ruled notebook lines, in the concept-03 hairline language. */}
      <span aria-hidden="true" className="absolute inset-0">
        {Array.from({ length: ruleCount }).map((_, i) => (
          <span
            key={i}
            className="absolute left-[var(--space-3)] right-[var(--space-3)] border-t border-rule"
            style={{ top: `${28 + i * 14}%`, opacity: 1 - i * 0.18 }}
          />
        ))}
        {/* One violet mark: the editorial accent, never a gradient. */}
        <span
          className="absolute top-0 h-full w-[3px] bg-[var(--link)]"
          style={{ [accentRight ? "right" : "left"]: 0 } as React.CSSProperties}
        />
        {/* Corner tick, referencing the concept's registration mark. */}
        <span className="absolute right-[var(--space-3)] top-[var(--space-2)] size-2 border-r border-t border-[var(--ink)]" />

        {/* The topic figure. Muted and small on purpose: it separates one cover from the next without
            competing with the title. Placed low-left, clear of the topic label (top-left), the tick
            (top-right), the index mark (bottom-right) and a centred title. */}
        {showFigure ? (
          <span className="absolute bottom-[var(--space-2)] left-[var(--space-3)] text-[var(--muted)] opacity-70">
            <Figure figure={figure} />
          </span>
        ) : null}
      </span>

      {/* Topic label */}
      {showTopic ? (
        <span className="absolute left-[var(--space-3)] top-[var(--space-2)] text-xs text-muted">
          {topic ? `#${topic}` : "note"}
        </span>
      ) : null}

      {/* Index mark */}
      {typeof index === "number" ? (
        <span className="absolute bottom-[var(--space-2)] right-[var(--space-3)] text-xs text-muted tabular-nums">
          {String(index + 1).padStart(2, "0")}
        </span>
      ) : null}

      {/* The title sits in the middle of the panel, clear of the topic label above and the
          "Illustration" label below. */}
      {children ? (
        <span className="absolute inset-x-[var(--space-3)] top-1/2 -translate-y-1/2">
          {children}
        </span>
      ) : null}

      {/* The visible "Illustration" label was removed on 2026-09-16 (Steven: "its weird that the
          bottom of those top cards still says illustration... we can just get rid of that wording").
          Nothing is lost: the panel makes no claim to be a screenshot now, and the aria-label above
          still identifies it as an illustration for assistive technology whenever the panel carries
          no title of its own. Do not re-add a visible label here. */}
    </span>
  );
}
