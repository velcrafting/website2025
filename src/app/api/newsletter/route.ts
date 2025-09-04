// src/app/api/newsletter/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

export const runtime = "nodejs";

type Payload = { email: string; firstName?: string; lastName?: string };

const { RESEND_API_KEY, RESEND_AUDIENCE_ID, RESEND_FROM } = process.env;

function hasConfig() {
  return Boolean(RESEND_API_KEY && RESEND_AUDIENCE_ID && RESEND_FROM);
}

export async function POST(req: Request) {
  try {
    const { email, firstName, lastName } = (await req.json()) as Partial<Payload>;
    const addr = email?.trim().toLowerCase();

    if (!addr) {
      return NextResponse.json({ ok: false, error: "Missing email" }, { status: 400 });
    }
    if (!hasConfig()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing envs. Require RESEND_API_KEY, RESEND_AUDIENCE_ID, RESEND_FROM.",
        },
        { status: 500 }
      );
    }

    const resend = new Resend(RESEND_API_KEY!);

    // Try update-by-email first (idempotent re-subscribe/touch)
    const upd = await resend.contacts.update({
      audienceId: RESEND_AUDIENCE_ID!,
      email: addr,
      firstName,
      lastName,
      unsubscribed: false,
    });

    // If update failed (e.g., not found), create instead
    if (upd.error) {
      const crt = await resend.contacts.create({
        audienceId: RESEND_AUDIENCE_ID!,
        email: addr,
        firstName,
        lastName,
        unsubscribed: false,
      });
      if (crt.error) {
        const msg = crt.error.message || "Unknown error";
        const permissiony = /restricted|forbidden|permission/i.test(msg);
        return NextResponse.json(
          {
            ok: false,
            error: permissiony
              ? "RESEND_API_KEY lacks Contacts/Audiences permissions. Use a Full Access server key."
              : `Create failed: ${msg}`,
          },
          { status: permissiony ? 403 : 502 }
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}