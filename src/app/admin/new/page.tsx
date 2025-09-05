// src/app/admin/new/page.tsx
import fs from "fs/promises";
import path from "path";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Create Article</h1>
      <form action={create} className="space-y-4">
        <div>
          <label className="block text-sm">Section</label>
          <select name="section" className="w-full rounded border px-3 py-2">
            <option value="writing">Writing</option>
            <option value="projects">Projects</option>
            <option value="labs">Labs</option>
          </select>
        </div>
        <div>
          <label className="block text-sm">Slug</label>
          <input name="slug" className="w-full rounded border px-3 py-2" required />
        </div>
        <div>
          <label className="block text-sm">Title</label>
          <input name="title" className="w-full rounded border px-3 py-2" required />
        </div>
        <div>
          <label className="block text-sm">Body (MDX)</label>
          <textarea name="body" rows={10} className="w-full rounded border px-3 py-2" />
        </div>
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white">
          Save
        </button>
      </form>
    </div>
  );
}

async function create(formData: FormData) {
  "use server";
  const section = formData.get("section")?.toString() || "writing";
  const slug = formData.get("slug")?.toString()?.toLowerCase();
  const title = formData.get("title")?.toString() || "Untitled";
  const body = formData.get("body")?.toString() || "";
  if (!slug) return;
  const dir = path.join(process.cwd(), "src", "content", section);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}.mdx`);
  const content = `---\ntitle: ${title}\ndate: ${new Date().toISOString()}\n---\n\n${body}\n`;
  await fs.writeFile(file, content, "utf8");
  redirect(`/${section}/${slug}`);
}