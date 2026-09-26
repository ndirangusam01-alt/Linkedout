import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/identity/service";
import { sendPasswordResetEmail } from "@/lib/email";

// Always returns the same response whether or not the email exists —
// see createPasswordResetToken's own comment for why. Never turn this
// into a way to check which emails are registered.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

  const result = await createPasswordResetToken(email);
  if (result) {
    await sendPasswordResetEmail(email, result.token);
  }
  return NextResponse.json({ ok: true, message: "If that email has an account, a reset link is on its way." });
}
