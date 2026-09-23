// src/app/admin/newsletter/page.tsx
import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, requireAdmin } from "@/lib/admin";
import {
  assertSafeNewsletterName,
  resolveSafeNewsletterPath,
  filesystemContentWritesEnabled,
} from "@/lib/content-paths";

// Server-side rendering of an optional status banner set by the action.
async function readStatus(): Promise<
  | { kind: "send-unavailable"; message: string }
  | { kind: "draft-saved"; message: string }
  | { kind: "filesystem-disabled"; message: string }
  | null
> {
  const store = await cookies();
  const raw = store.get("newsletter_status")?.value;
  if (!raw) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as { kind?: string; message?: string; exp?: number };
    if (typeof decoded.exp === "number" && decoded.exp < Date.now()) {
      return null;
    }
    if (decoded.kind === "send-unavailable" && typeof decoded.message === "string") {
      return { kind: "send-unavailable", message: decoded.message };
    }
    if (decoded.kind === "draft-saved" && typeof decoded.message === "string") {
      return { kind: "draft-saved", message: decoded.message };
    }
    if (decoded.kind === "filesystem-disabled" && typeof decoded.message === "string") {
      return { kind: "filesystem-disabled", message: decoded.message };
    }
    return null;
  } catch {
    return null;
  }
}

function encodeStatus(payload: { kind: string; message: string }): string {
  const exp = Date.now() + 60_000; // 60-second flash.
  const json = JSON.stringify({ ...payload, exp });
  return Buffer.from(json, "utf8").toString("base64url");
}

export default async function Page() {
  if (!(await isAdmin())) redirect("/admin/login");
  const status = await readStatus();
  return (
    <div className="mx-auto max-w-2xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Newsletter</h1>
      {status?.kind === "send-unavailable" ? (
        <div
          role="status"
          aria-live="polite"
          data-status="send-unavailable"
          className="rounded-[var(--radius-surface)] border border-[var(--warn-ink)]/35 bg-warn-fill px-4 py-3 text-warn-ink"
        >
          <strong className="font-semibold">Send unavailable.</strong>{" "}
          <span>{status.message}</span>
        </div>
      ) : null}
      {status?.kind === "draft-saved" ? (
        <div
          role="status"
          aria-live="polite"
          data-status="draft-saved"
          className="rounded-[var(--radius-surface)] border border-[var(--success-ink)]/35 bg-paper-raised px-4 py-3 text-[var(--success-ink)]"
        >
          <strong className="font-semibold">Draft saved.</strong>{" "}
          <span>{status.message}</span>
        </div>
      ) : null}
      {status?.kind === "filesystem-disabled" ? (
        <div role="status" aria-live="polite" className="rounded-[var(--radius-surface)] border border-[var(--warn-ink)]/35 bg-warn-fill px-4 py-3 text-warn-ink">
          <strong className="font-semibold">File-backed drafts are disabled.</strong> {status.message}
        </div>
      ) : null}
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
            className="rounded-[var(--radius-surface)] bg-paper-raised px-4 py-2 text-muted"
          >
            Save Draft
          </button>
          <button
            type="submit"
            name="intent"
            value="send"
            className="rounded-[var(--radius-surface)] bg-accent px-4 py-2 text-on-accent"
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
  // Recheck authorization immediately before any side effect.
  await requireAdmin();

  const subject = formData.get("subject")?.toString() || "";
  const body = formData.get("body")?.toString() || "";
  const intent = formData.get("intent")?.toString();

  const store = await cookies();

  // Quarantine sending: no directory creation, no file write, no provider
  // call. The send-disabled outcome is shown to the user via a short-lived
  // cookie that the page reads on render.
  if (intent === "send") {
    store.set(
      "newsletter_status",
      encodeStatus({
        kind: "send-unavailable",
        message:
          "Newsletter send is unavailable in this slice. Build a qualified campaign adapter before enabling delivery.",
      }),
      {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60,
      },
    );
    redirect("/admin/newsletter");
  }

  if (!filesystemContentWritesEnabled()) {
    store.set(
      "newsletter_status",
      encodeStatus({
        kind: "filesystem-disabled",
        message: "The hosted editor stores content in Postgres; this legacy file draft was not saved.",
      }),
      { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 },
    );
    redirect("/admin/newsletter");
  }

  // Draft path: validate the timestamp-based name, then write the file.
  const rawName = String(Date.now());
  let fileName: string;
  try {
    fileName = assertSafeNewsletterName(rawName);
  } catch {
    redirect("/admin/newsletter");
  }
  // Resolve the validated destination path inside the content root. The
  // helper is the single authority for containment; newsletter paths live
  // under `<root>/newsletters/`.
  let file: string;
  try {
    file = await resolveSafeNewsletterPath(
      path.join(process.cwd(), "src", "content"),
      fileName,
      ".mdx",
    );
  } catch {
    redirect("/admin/newsletter");
  }
  const content = `---\ntitle: ${subject}\ndate: ${new Date().toISOString()}\n---\n\n${body}\n`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, "utf8");

  store.set(
    "newsletter_status",
    encodeStatus({
      kind: "draft-saved",
      message: `Saved draft ${fileName}.mdx`,
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    },
  );
  redirect("/admin/newsletter");
}
