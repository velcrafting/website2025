// src/app/api/newsletter/route.ts
import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { Resend } from "resend";

export const runtime = "nodejs";

type Payload = { email: string; firstName?: string; lastName?: string };

const { RESEND_API_KEY, RESEND_AUDIENCE_ID, RESEND_FROM } = process.env;

function hasConfig() {
  return Boolean(RESEND_API_KEY && RESEND_AUDIENCE_ID && RESEND_FROM);
}

export async function POST(req: Request) {
  // Rate limit BEFORE parsing or any external call, so a script cannot spend the sending reputation or
  // eat the Resend quota. Same per-IP, per-hour pattern as src/app/api/event/route.ts.
  //
  // FAILURE POLICY (R3, 2026-09-17). The first version of this block failed open: if the store errored, the
  // signup proceeded. An independent audit rejected that, correctly. A public endpoint that keeps accepting
  // while its abuse control is unreachable cannot be reasoned about, and "the limiter silently did nothing"
  // is not a decision anyone can see in the logs. So a limiter outage now returns an explicit RETRYABLE
  // response, BEFORE any provider call:
  //
  //   no decision possible  → 503 + Retry-After: 60, zero provider calls
  //   over the cap          → 429, zero provider calls
  //   under the cap         → the signup proceeds exactly as before
  //
  // 503 rather than 429 on purpose: the request was not abusive, the service is temporarily unable to make
  // the decision. Retry-After tells a well-behaved client when to come back. The public signup path stays
  // open in every other respect — no auth, no captcha, no account.
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const rlKey = `rl:newsletter:${ip}:${new Date().toISOString().slice(0, 13)}`;
    const hits = await kv.incr(rlKey);
    if (hits === 1) await kv.expire(rlKey, 3600);
    if (hits > 10) {
      return NextResponse.json(
        { ok: false, error: "Too many signups from this address. Try again later." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Signups are briefly unavailable. Please try again in a minute." },
      { status: 503, headers: { "Retry-After": "60" } },
    );
  }

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