import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { setPremiumStatus } from "@/lib/identity/service";

// Demo-only convenience so the ad-free toggle is actually testable without
// a real payment processor to cancel a subscription through. A real
// deployment would gate this behind actual subscription cancellation.
export async function POST() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });
  }
  const account = await setPremiumStatus(accountId, false);
  return NextResponse.json({ user: { email: account.email, realName: account.realName, isPremium: account.isPremium } });
}
