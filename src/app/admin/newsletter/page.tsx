// src/app/admin/newsletter/page.tsx
import fs from "fs/promises";
import path from "path";
import { Resend } from "resend";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Newsletter</h1>
      <form action={handle} className="space-y-4">
        <div>
          <label className="block text-sm">Subject</label>
          <input name="subject" className="w-full rounded border px-3 py-2" required />
        </div>
        <div>
          <label className="block text-sm">Body (HTML/MDX)</label>
          <textarea name="body" rows={10} className="w-full rounded border px-3 py-2" />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            name="intent"
            value="draft"
            className="rounded bg-neutral-200 px-4 py-2"
          >
            Save Draft
          </button>
          <button
            type="submit"
            name="intent"
            value="send"
            className="rounded bg-neutral-900 px-4 py-2 text-white"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

async function handle(formData: FormData) {
  "use server";
  const subject = formData.get("subject")?.toString() || "";
  const body = formData.get("body")?.toString() || "";
  const intent = formData.get("intent")?.toString();
  const dir = path.join(process.cwd(), "src", "content", "newsletters");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}.mdx`);
  const content = `---\ntitle: ${subject}\ndate: ${new Date().toISOString()}\n---\n\n${body}\n`;

  if (intent === "send") {
    const { RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL } = process.env;
    if (RESEND_API_KEY && CONTACT_FROM_EMAIL && CONTACT_TO_EMAIL) {
      const resend = new Resend(RESEND_API_KEY);
      await resend.emails.send({
        from: CONTACT_FROM_EMAIL,
        to: CONTACT_TO_EMAIL,
        subject,
        html: body,
      });
    }
  }

  await fs.writeFile(file, content, "utf8");
}