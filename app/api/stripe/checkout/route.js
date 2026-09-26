import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { getAccountById, setStripeCustomerId } from "@/lib/identity/service";
import { getStripe, isStripeConfigured, getPriceId, getAppUrl } from "@/lib/stripe";

// Creates a Stripe Checkout Session for the Premium subscription and
// returns its URL for the client to redirect to. Does NOT flip is_premium
// itself — that only happens once Stripe confirms payment, via the
// webhook handler (app/api/stripe/webhook/route.js).
export async function POST() {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "You need to be logged in to upgrade." }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Stripe isn't configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to .env.local (see README § Stripe setup).", code: "STRIPE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const account = await getAccountById(accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  try {
    const stripe = getStripe();
    const appUrl = getAppUrl();

    let customerId = account.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: account.email,
        name: account.realName,
        metadata: { accountId },
      });
      customerId = customer.id;
      await setStripeCustomerId(accountId, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: accountId,
      line_items: [{ price: getPriceId(), quantity: 1 }],
      success_url: `${appUrl}/premium?checkout=success`,
      cancel_url: `${appUrl}/premium?checkout=cancelled`,
      metadata: { accountId },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e.code === "STRIPE_NOT_CONFIGURED") {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 503 });
    }
    console.error("Stripe checkout session creation failed:", e.message);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 502 });
  }
}
