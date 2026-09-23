// src/app/api/cms/sync/route.ts - API for agent-dashboard to push content
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  assertSafeRawName,
  normalizeContentName,
  resolveSafeContentPath,
  resolveSafeExistingContentPath,
  UnsafeContentPathError,
  filesystemContentWritesEnabled,
} from "@/lib/content-paths";

const ADMIN_COOKIE = "admin";

// Verify either cookie auth or agent API key
async function verifyAuth(req: NextRequest) {
  // Check agent API key
  const apiKey = req.headers.get("x-agent-key");
  const expectedAgentKey = process.env.AGENT_SYNC_KEY;

  if (expectedAgentKey && apiKey === expectedAgentKey) {
    return true;
  }

  // Check cookie auth
  const key = process.env.ADMIN_KEY;
  const store = await cookies();
  const cookie = store.get(ADMIN_COOKIE)?.value;
  return Boolean(key && cookie && cookie === key);
}

// Shared content-root path used by every handler below.
function blogContentRoot(): string {
  return path.join(process.cwd(), "src", "content");
}

// (Raw-name validation and normalization live in src/lib/content-paths.ts.)

function unsafePathResponse(err: unknown): NextResponse {
  if (err instanceof UnsafeContentPathError) {
    return NextResponse.json(
      { error: "Unsafe content path", code: err.code, message: err.message },
      { status: 400 },
    );
  }
  throw err;
}

export async function POST(req: NextRequest) {
  // Verify auth
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!filesystemContentWritesEnabled()) {
    return NextResponse.json({ error: "Filesystem CMS writes are disabled in hosted storage mode" }, { status: 410 });
  }

  try {
    const body = await req.json();
    const { pillar, slug, title, summary, tags, status, body: content, featured } = body;

    if (!pillar || !slug || !title) {
      return NextResponse.json(
        { error: "Missing required fields: pillar, slug, title" },
        { status: 400 }
      );
    }

    if (typeof pillar !== "string" || typeof slug !== "string") {
      return NextResponse.json(
        { error: "pillar and slug must be strings" },
        { status: 400 },
      );
    }

    // Validate dangerous syntax on every raw name, then normalize.
    try {
      assertSafeRawName(pillar, "pillar");
      assertSafeRawName(slug, "slug");
    } catch (err) {
      return unsafePathResponse(err);
    }
    let safePillar: string;
    let safeSlug: string;
    try {
      safePillar = normalizeContentName(pillar, "pillar");
      safeSlug = normalizeContentName(slug, "slug");
    } catch (err) {
      return unsafePathResponse(err);
    }

    // Resolve and validate the destination path before any filesystem effect.
    let filePath: string;
    try {
      filePath = await resolveSafeContentPath(
        blogContentRoot(),
        safePillar,
        safeSlug,
        ".mdx",
      );
    } catch (err) {
      return unsafePathResponse(err);
    }

    // Build frontmatter
    const tagsArray = Array.isArray(tags) ? tags : tags?.split(",").map((t: string) => t.trim()).filter(Boolean) || [];
    const frontmatter = [
      "---",
      `title: "${title}"`,
      summary ? `summary: "${summary}"` : null,
      status === "published" ? `date: "${new Date().toISOString().split("T")[0]}"` : null,
      `status: ${status || "draft"}`,
      featured ? "featured: true" : null,
      tagsArray.length ? `tags: [${tagsArray.map((t: string) => `"${t}"`).join(", ")}]` : null,
      "---",
      "",
    ].filter(Boolean).join("\n");

    const fullContent = `${frontmatter}\n\n${content || ""}`;

    // Write file
    const pillarDir = path.dirname(filePath);
    await fs.mkdir(pillarDir, { recursive: true });
    await fs.writeFile(filePath, fullContent, "utf8");

    return NextResponse.json({
      success: true,
      path: `/blog/${safePillar}/${safeSlug}`,
      file: filePath,
    });
  } catch (error) {
    console.error("CMS sync error:", error);
    return NextResponse.json(
      { error: "Failed to write content" },
      { status: 500 }
    );
  }
}

// GET - list all articles (for agent to sync state)
export async function GET(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const blogDir = path.join(process.cwd(), "src", "content", "blog");
    const articles: Array<{ pillar: string; slug: string; title: string; status: string }> = [];

    const pillars = await fs.readdir(blogDir);
    for (const pillar of pillars) {
      const pillarPath = path.join(blogDir, pillar);
      const stat = await fs.stat(pillarPath);
      if (!stat.isDirectory()) continue;

      const files = await fs.readdir(pillarPath);
      for (const file of files) {
        if (!file.endsWith(".mdx")) continue;
        const slug = file.replace(".mdx", "");
        const filePath = path.join(pillarPath, file);
        const content = await fs.readFile(filePath, "utf8");

        const match = content.match(/^---\n([\s\S]*?)\n---/);
        let title = slug;
        let status = "draft";

        if (match) {
          const fm = match[1];
          const titleMatch = fm.match(/title:\s*"([^"]+)"/);
          const statusMatch = fm.match(/status:\s*(\w+)/);
          if (titleMatch) title = titleMatch[1];
          if (statusMatch) status = statusMatch[1];
        }

        articles.push({ pillar, slug, title, status });
      }
    }

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("CMS list error:", error);
    return NextResponse.json(
      { error: "Failed to list articles" },
      { status: 500 }
    );
  }
}

// PUT - update existing article
export async function PUT(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!filesystemContentWritesEnabled()) {
    return NextResponse.json({ error: "Filesystem CMS writes are disabled in hosted storage mode" }, { status: 410 });
  }

  try {
    const body = await req.json();
    const { pillar, slug, title, summary, tags, status, body: content, featured, newPillar, newSlug } = body;

    if (!pillar || !slug) {
      return NextResponse.json({ error: "Missing pillar or slug" }, { status: 400 });
    }
    if (typeof pillar !== "string" || typeof slug !== "string") {
      return NextResponse.json({ error: "pillar and slug must be strings" }, { status: 400 });
    }
    if (newPillar !== undefined && typeof newPillar !== "string") {
      return NextResponse.json({ error: "newPillar must be a string" }, { status: 400 });
    }
    if (newSlug !== undefined && typeof newSlug !== "string") {
      return NextResponse.json({ error: "newSlug must be a string" }, { status: 400 });
    }

    // Validate dangerous syntax on every raw name, then normalize.
    try {
      assertSafeRawName(pillar, "pillar");
      assertSafeRawName(slug, "slug");
      if (newPillar !== undefined) assertSafeRawName(newPillar, "newPillar");
      if (newSlug !== undefined) assertSafeRawName(newSlug, "newSlug");
    } catch (err) {
      return unsafePathResponse(err);
    }
    let safePillar: string;
    let safeSlug: string;
    let targetPillar: string;
    let targetSlug: string;
    try {
      safePillar = normalizeContentName(pillar, "pillar");
      safeSlug = normalizeContentName(slug, "slug");
      targetPillar = newPillar !== undefined
        ? normalizeContentName(newPillar, "newPillar")
        : safePillar;
      targetSlug = newSlug !== undefined
        ? normalizeContentName(newSlug, "newSlug")
        : safeSlug;
    } catch (err) {
      return unsafePathResponse(err);
    }

    // Validate the *original* (existing) path before any unlink.
    let oldRealFile: string | null = null;
    try {
      oldRealFile = await resolveSafeExistingContentPath(
        blogContentRoot(),
        safePillar,
        safeSlug,
        ".mdx",
      );
    } catch (err) {
      return unsafePathResponse(err);
    }

    // Validate the *target* path before any write or unlink.
    let filePath: string;
    try {
      filePath = await resolveSafeContentPath(
        blogContentRoot(),
        targetPillar,
        targetSlug,
        ".mdx",
      );
    } catch (err) {
      return unsafePathResponse(err);
    }

    // Build frontmatter
    const tagsArray = Array.isArray(tags) ? tags : tags?.split(",").map((t: string) => t.trim()).filter(Boolean) || [];
    const frontmatter = [
      "---",
      `title: "${title || slug}"`,
      summary ? `summary: "${summary}"` : null,
      status === "published" ? `date: "${new Date().toISOString().split("T")[0]}"` : null,
      `status: ${status || "draft"}`,
      featured ? "featured: true" : null,
      tagsArray.length ? `tags: [${tagsArray.map((t: string) => `"${t}"`).join(", ")}]` : null,
      "---",
      "",
    ].filter(Boolean).join("\n");

    const fullContent = `${frontmatter}\n\n${content || ""}`;

    // Delete old if moving. Only after both paths are validated.
    const rename = safePillar !== targetPillar || safeSlug !== targetSlug;
    if (rename && oldRealFile) {
      await fs.unlink(oldRealFile).catch(() => {});
    }

    // Write new
    const pillarDir = path.dirname(filePath);
    await fs.mkdir(pillarDir, { recursive: true });
    await fs.writeFile(filePath, fullContent, "utf8");

    return NextResponse.json({ success: true, path: `/blog/${targetPillar}/${targetSlug}` });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE - delete article
export async function DELETE(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!filesystemContentWritesEnabled()) {
    return NextResponse.json({ error: "Filesystem CMS writes are disabled in hosted storage mode" }, { status: 410 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const pillar = searchParams.get("pillar");
    const slug = searchParams.get("slug");

    if (!pillar || !slug) {
      return NextResponse.json({ error: "Missing pillar or slug" }, { status: 400 });
    }

    // Validate raw names (DELETE uses existing-path semantics: must not
    // normalize away a non-existent file).
    try {
      assertSafeRawName(pillar, "pillar");
      assertSafeRawName(slug, "slug");
    } catch (err) {
      return unsafePathResponse(err);
    }

    const safePillar = pillar.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    let realFile: string;
    try {
      realFile = await resolveSafeExistingContentPath(
        blogContentRoot(),
        safePillar,
        safeSlug,
        ".mdx",
      );
    } catch (err) {
      return unsafePathResponse(err);
    }

    await fs.unlink(realFile);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
