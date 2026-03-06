export type KPIItem = { value: string; label: string };

/**
 * Frontmatter for MDX articles and case studies.
 *
 * hero:
 *   Recommended source: 1720-2000 px wide, 16:9 or 3:2.
 *   Use JPEG for photography, PNG for UI/diagrams. Path should be absolute under /public.
 *   Example: "/blog/demo-showcase/hero.jpg"
 *
 * ogImage:
 *   Social preview image. Prefer exactly 1200x630.
 *   If omitted, we fall back to /og?title=<title> and render a dynamic card.
 *
 * tags:
 *   2-6 short, stable labels. Lowercase words, no punctuation.
 *   Good: ["ai", "moderation", "dashboards"]
 *   Avoid: ["Random Thoughts!!!", "Q2-2025-Update"]
 */

export type Frontmatter = {
  title: string;
  summary?: string;
  date?: string;
  kpi?: KPIItem[];
  hero?: string;      // e.g., "/blog/<slug>/hero.jpg" (see size notes above)
  ogImage?: string;   // 1200x630 recommended
  tags?: string[];    // 2-6 lowercase labels
  featured?: boolean; // show in Featured strips on listing pages
  // Scheduler fields
  scheduledAt?: string; // ISO date for scheduled publishing
  status?: "draft" | "scheduled" | "published"; // article status
  pillar?: "agentic-discovery" | "systems-design" | "strategic-comms"; // authority pillar
};

export type Doc<T = Record<string, unknown>> = {
  slug: string;
  frontmatter: T;
  content: string;
};
