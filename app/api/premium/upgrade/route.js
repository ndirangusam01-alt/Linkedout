import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { setPremiumStatus } from "@/lib/identity/service";

// Mock checkout — see README. A real integration would create a Stripe
// Checkout Session here and flip is_premium from a webhook after payment
// confirms, not directly from this route.
export async function POST() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "You need to be logged in to upgrade." }, { status: 401 });
  }
  const account = await setPremiumStatus(accountId, true);
  return NextResponse.json({ user: { email: account.email, realName: account.realName, isPremium: account.isPremium } });
}
