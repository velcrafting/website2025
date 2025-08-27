// src/app/api/contact/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name = "Anonymous", email, message } = await req.json();

    if (!email || !message) {
      return NextResponse.json({ ok: false, error: "Missing email or message" }, { status: 400 });
    }

    const { error } = await resend.emails.send({
      from: "Portfolio <hello@your-verified-domain.com>", // must be a verified domain in Resend
      to: process.env.CONTACT_TO_EMAIL!,
      replyTo: email, // makes replying easy
      subject: `Portfolio contact: ${name}`,
      text: `${email}\n\n${message}`,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: "Email failed" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
}