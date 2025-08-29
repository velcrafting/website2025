// src/app/api/contact/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type ContactPayload = { name?: string; email: string; subject?: string; message: string };

const CONFIG = {
  key: process.env.RESEND_API_KEY,
  to: process.env.CONTACT_TO_EMAIL,
  from: process.env.CONTACT_FROM_EMAIL,
} as const;

function hasMailConfig(
  cfg: typeof CONFIG
): cfg is { key: string; to: string; from: string } {
  return Boolean(cfg.key && cfg.to && cfg.from);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ContactPayload>;
    const name = body.name?.trim() || "Anonymous";
    const email = body.email?.trim();
    const subject = body.subject?.trim() || `Portfolio contact: ${name}`;
    const message = body.message?.toString();

    if (!email || !message) {
      return NextResponse.json(
        { ok: false, error: "Missing email or message" },
        { status: 400 }
      );
    }

    // Fail-safe: don’t crash builds if mail isn’t configured
    if (!hasMailConfig(CONFIG)) {
      console.warn("Contact API dry run: missing RESEND envs");
      return NextResponse.json({ ok: true, dryRun: true });
    }

    const resend = new Resend(CONFIG.key);

    const { error } = await resend.emails.send({
      from: `Portfolio <${CONFIG.from}>`,
      to: [CONFIG.to],
      replyTo: email ? `${name} <${email}>` : undefined,
      subject,
      text: `${email}\n\n${message}`,
    });

    if (error) {
      console.error("Resend send error:", error);
      return NextResponse.json({ ok: false, error: "Email failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, configured: hasMailConfig(CONFIG) });
}
