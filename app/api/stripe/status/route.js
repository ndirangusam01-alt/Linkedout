import { NextResponse } from "next/server";
import { isStripeConfigured } from "@/lib/stripe";

// Lets the client decide whether to show "Upgrade" (real Stripe checkout)
// or fall back to the demo toggle, without needing to attempt a checkout
// first just to find out.
export async function GET() {
  return NextResponse.json({ configured: isStripeConfigured() });
}
