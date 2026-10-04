import { NextResponse } from "next/server";
import { getCurrentAccountId, clearSessionCookie } from "@/lib/session";
import { getAccountById, verifyCredentials, deactivateAccount } from "@/lib/identity/service";

// Reversible: logging back in with the correct password reactivates
// automatically (see /api/auth/login). Distinct from /api/profile/delete,
// which is permanent. Requires re-entering the current password, same
// friction as deletion — a deliberate speed bump against a one-click
// accidental or coerced deactivation.
export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const account = await getAccountById(accountId);
  if (account.hasPassword) {
    const body = await request.json().catch(() => null);
    const password = body?.password || "";
    const verified = await verifyCredentials(account.email, password);
    if (!verified) return NextResponse.json({ error: "Incorrect password." }, { status: 400 });
  }

  await deactivateAccount(accountId);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
