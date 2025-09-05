# Velcrafting Portfolio

Modern, content‑driven portfolio built with Next.js 15 (App Router), MDX content, Tailwind v4 styles, and a small composable UI kit. It includes writing, projects, labs, an interactive art experience, and polished presentation with search, tags, featured content, and related reading.

## Quick Start

- Node: 20.x (project enforces `>=20 <21`)
- Install: `npm i`
- Dev server: `npm run dev` (or `npm run dev:webpack` to disable Turbopack)
- Build: `npm run build` then `npm run start`

## Pages

- Home (`/`): Hero, KPI tiles, experience highlights, testimonials, and a “Latest” strip pulling from Projects, Writing, and Labs.
- About (`/about`): Bio, skills overview, and a timeline of experience and selected highlights. Uses `Highlight` and `Timeline` components.
- Projects (`/projects`): MDX‑backed case studies with list filtering (search, tags, sort) and featured strip. Detail pages at `/projects/[slug]` render rich MDX with KPI, hero, tags, and related items.
- Writing (`/writing`): Essays/notes with the same list features as Projects. Detail pages at `/writing/[slug]` use the case‑study layout and compute related posts by tag overlap then recency.
- Labs (`/labs`): Experimental prototypes/WIP tools. Same list/detail flow as Projects and Writing. Detail pages at `/labs/[slug]`.
- Art (`/art`): “Bouncing Universe” interactive canvas. Shapes represent visits. Hover to influence orbits. Two modes:
  - Sandbox: shapes loop and respawn over time.
  - Battle: pick a winner; a black hole grows until one shape type remains (≤ 60s). Results tally anonymously over time. The sidebar panel lets you pick a shape, tune mouse influence, asteroid volume, and FPS.
  - Contact (`/contact`): Simple contact form (Resend email integration if env vars are set) and scheduling embed.
  - Admin (`/admin`): Private dashboard for creating MDX articles and drafting or sending newsletters. When logged in, the sidebar exposes quick links to these admin tools.

## Content Authoring

- MDX lives under `src/content/{writing|projects|labs}`.
- Frontmatter fields: `title` (required), `summary`, `date`, `hero`, `ogImage`, `tags`, `featured`, `kpi`.
- Images: Place assets under `public/...` and reference with absolute paths (e.g., "/writing/demo-showcase/hero.png").
- MDX components available out of the box: `Figure`, `Gallery`, upgraded `img` via `ContentImage`.

Frontmatter example:

```mdx
---
title: MDX Feature Showcase
summary: A compact tour of frontmatter, code, images, and more.
date: 2025-05-31
hero: "/writing/demo-showcase/hero.png"
ogImage: "/writing/demo-showcase/hero.png"
tags: [ai, docs]
featured: true
---
```

## Architecture

- App Router: Pages live in `src/app/*`. Shared layout (`layout.tsx`) renders a fixed left sidebar and a scrollable main content pane.
- MDX loading: `lib/mdx.ts` and `lib/content.ts` parse MDX + frontmatter and provide helpers for list/detail pages.
- Sidebar + TOC: `components/layout/Sidebar` with dynamic art controls on `/art` and a sticky in‑page TOC for MDX pages.
- UI Kit: Lightweight components in `components/ui` (Card, Button, Inputs, Skeleton, Tabs, Modal, Tooltip, Drawer, etc.).
- SEO/OG: `src/app/og/route.tsx` generates safe Open Graph cards; `lib/seo.ts` builds metadata.

## Interactive Art (/art)

- Canvas client: `src/app/art/ArtClient.tsx` orchestrates rendering, physics, and game loop. Sidebar panel controls mode, picks, mouse gravity, asteroid volume, and FPS.
- Game phases: `sandbox`, `battle` with `countdown → running → finished` flow. Collisions can shatter shapes into fragments; subtle space background and asteroids provide ambience.
- State endpoints: `/api/state` returns anonymized visit/click histograms; `/api/event` increments histograms (with simple KV‑backed rate limiting). `/api/art/winner` tallies all‑time winners.
- Storage: Uses Vercel KV when configured; otherwise falls back to an in‑memory store for local dev.

## Environment

Copy `.env.example` → `.env` (or `.env.local`). All are optional; sensible fallbacks are provided for local development.

- Contact email: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL`
- KV store: `KV_REST_API_URL`, `KV_REST_API_TOKEN` (enables persistent analytics and art tallies)
- Site URL: `NEXT_PUBLIC_SITE_URL` (used for metadata base and OG routes)
- Admin login: `ADMIN_USERNAME`, `ADMIN_KEY`

## Scripts

- `dev` — Next dev
- `dev:webpack` — Next dev without Turbopack
- `build`, `start`, `lint`, `typecheck`
- `commit-content.mjs` — helper to commit MDX content changes

## Repository Structure

See `tree.txt` for a descriptive, per‑file overview of the codebase.

## Troubleshooting

- Turbopack issues: run `npm run dev:webpack`.
- Stuck caches: delete `.next` then restart the dev server.