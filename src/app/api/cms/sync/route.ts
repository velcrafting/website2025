// src/app/api/cms/sync/route.ts - API for agent-dashboard to push content
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

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

export async function POST(req: NextRequest) {
  // Verify auth
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    // Sanitize slug
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const safePillar = pillar.toLowerCase().replace(/[^a-z0-9-]/g, "-");

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
    const pillarDir = path.join(process.cwd(), "src", "content", "blog", safePillar);
    await fs.mkdir(pillarDir, { recursive: true });
    const filePath = path.join(pillarDir, `${safeSlug}.mdx`);
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

  try {
    const body = await req.json();
    const { pillar, slug, title, summary, tags, status, body: content, featured, newPillar, newSlug } = body;

    if (!pillar || !slug) {
      return NextResponse.json({ error: "Missing pillar or slug" }, { status: 400 });
    }

    const safePillar = pillar.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const targetPillar = (newPillar || safePillar).toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const targetSlug = (newSlug || safeSlug).toLowerCase().replace(/[^a-z0-9-]/g, "-");

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

    // Delete old if moving
    if (safePillar !== targetPillar || safeSlug !== targetSlug) {
      const oldPath = path.join(process.cwd(), "src", "content", "blog", safePillar, `${safeSlug}.mdx`);
      await fs.unlink(oldPath).catch(() => {});
    }

    // Write new
    const pillarDir = path.join(process.cwd(), "src", "content", "blog", targetPillar);
    await fs.mkdir(pillarDir, { recursive: true });
    const filePath = path.join(pillarDir, `${targetSlug}.mdx`);
    await fs.writeFile(filePath, fullContent, "utf8");

    return NextResponse.json({ success: true, path: `/blog/${targetPillar}/${targetSlug}` });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}

// DELETE - delete article
export async function DELETE(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const pillar = searchParams.get("pillar");
    const slug = searchParams.get("slug");

    if (!pillar || !slug) {
      return NextResponse.json({ error: "Missing pillar or slug" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "src", "content", "blog", pillar, `${slug}.mdx`);
    await fs.unlink(filePath);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
