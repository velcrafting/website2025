# Velcrafting Portfolio

Modern, content-driven portfolio built on Next.js 15 (App Router) with MDX, Tailwind v4, and a small UI kit. It includes writing/projects/labs sections, tag-based filtering and search, featured strips, related content, and polished presentation.

## Quick Start

- Node: 20.x (project enforces `>=20 <21`)
- Install: `npm i`
- Dev: `npm run dev` (or `npm run dev:webpack` to disable Turbopack)
- Build: `npm run build` → `npm run start`

## Features

- MDX content for Writing, Projects, and Labs under `src/content/*`
- Rich Markdown: headings, autolinked anchors, callouts, images, galleries
- Stable code highlighting via rehype-prism-plus (titles, line numbers supported via remark-code-titles)
- Per-article frontmatter: `title`, `summary`, `date`, `hero`, `ogImage`, `tags`, `featured`
- Related content grid (by tag overlap, then recency)
- Tag chips (clickable) and per‑section tag filters + search + sort (Newest / A–Z / Most tags)
- Featured strip per section (horizontal scroll)
- Compact card view option for denser grids
- Sidebar with animated gradient footer icons

## Content Structure

Place MDX files under:

- `src/content/writing/*.mdx`
- `src/content/projects/*.mdx`
- `src/content/labs/*.mdx`

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

Notes:
- `hero`: absolute path under `/public`
- `tags`: 2–6 lowercase labels
- `featured`: marks content for the “Featured” strip on list pages

## Pages

- `/writing`, `/projects`, `/labs` — list pages with description, search, tags, sort, and optional featured row
  - Query params: `?tag=ai&q=search+terms&sort=new|alpha|tags&view=grid|compact`
- Detail pages: `/writing/[slug]`, `/projects/[slug]`, `/labs/[slug]`
  - Render via `CaseStudyLayout` with hero, KPI (optional), tags, and a “Read more” section

## MDX & Highlighting

- MDX configured via `@next/mdx` in `next.config.ts`
- Syntax highlighting uses `rehype-prism-plus`; code titles via `remark-code-titles`
- Styling in `src/styles/prose.css` (Prism token colors and code-title bar)

## UI Kit Highlights

- Cards: `ContentCard` with hover lift and gradient border effect on hover
- Filter bar: `FilterBar` drives URL updates for filters with a tiny pending spinner
- Featured strip: `FeaturedStrip` shows hand-picked content
- Gradient icons: `GradientIcon` renders white icons that switch to animated rainbow strokes on hover

## Environment

Copy `.env.example` → `.env` (or `.env.local`). Optional keys:

- `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` (Contact API)
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` (analytics and rate limit fallbacks to in-memory if not set)
- `NEXT_PUBLIC_SITE_URL` for metadata base and OG routes

## Dev Notes

- Turbopack hangs: use `npm run dev:webpack` to disable Turbopack if needed.
- Caches: if dev/build stalls, try `rm -rf .next`.

## Scripts

- `dev` — Next dev
- `dev:webpack` — Next dev without Turbopack
- `build`, `start`, `lint`, `typecheck`

## Repository Layout (excerpt)
```text
velcrafting-portfolio/
├── public/
├── src/
│  ├── app/
│  ├── components/
│  │  ├── listing/     # ContentCard, FilterBar, FeaturedStrip
│  │  ├── layout/
│  │  ├── mdx/
│  │  └── ui/
│  ├── content/
│  │  ├── writing/
│  │  ├── projects/
│  │  └── labs/
│  ├── lib/
│  └── styles/
├── next.config.ts
├── package.json
└── tsconfig.json
```
