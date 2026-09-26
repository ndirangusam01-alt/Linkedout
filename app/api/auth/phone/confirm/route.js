import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { confirmPhoneVerification } from "@/lib/identity/service";

export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const code = body?.code?.trim();
  if (!code) return NextResponse.json({ error: "Code is required." }, { status: 400 });

  const result = await confirmPhoneVerification(accountId, code);
  if (!result.ok) {
    const messages = {
      no_pending_request: "Request a code first.",
      expired: "That code expired — request a new one.",
      wrong_code: "Incorrect code.",
      too_many_attempts: "Too many attempts — request a new code.",
    };
    return NextResponse.json({ error: messages[result.reason] || "Could not verify phone." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
