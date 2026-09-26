import { NextResponse } from "next/server";
import { verifyCredentials, signSession, isAccountDeactivated, reactivateAccount } from "@/lib/identity/service";
import { createSessionCookie } from "@/lib/session";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const account = await verifyCredentials(email, password);
  if (!account) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  // X-style reactivation: logging back in with the right password during
  // the deactivation period reactivates the account automatically, rather
  // than requiring a separate "reactivate" step. There's no cooldown grace
  // period enforced here (e.g. a 30-day hard deletion window) — deactivate
  // is reversible indefinitely until the account is explicitly deleted.
  const wasDeactivated = await isAccountDeactivated(account.id);
  if (wasDeactivated) await reactivateAccount(account.id);

  await createSessionCookie(account.id);
  const token = await signSession(account.id);
  return NextResponse.json({ email: account.email, realName: account.realName, token, reactivated: wasDeactivated });
}
