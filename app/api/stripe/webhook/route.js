import { NextResponse } from "next/server";
import { getStripe, getWebhookSecret, tierForPriceId } from "@/lib/stripe";
import { getAccountByStripeCustomerId, applyStripeSubscriptionEvent } from "@/lib/identity/service";

// Stripe webhook endpoint. This is the ONLY place premium_tier ever gets
// set based on real payment state — never from a client-triggered route.
// Point your Stripe webhook (or `stripe listen --forward-to`) at
// POST /api/stripe/webhook with these events enabled:
//   checkout.session.completed, customer.subscription.updated,
//   customer.subscription.deleted
export async function POST(request) {
  let stripe;
  let webhookSecret;
  try {
    stripe = getStripe();
    webhookSecret = getWebhookSecret();
  } catch (e) {
    console.error("Stripe webhook received but Stripe isn't configured:", e.message);
    return NextResponse.json({ error: e.message }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (e) {
    console.error("Stripe webhook signature verification failed:", e.message);
    return NextResponse.json({ error: `Webhook signature verification failed: ${e.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const accountId = session.client_reference_id || session.metadata?.accountId;
        if (accountId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const tier = tierForPriceId(priceId) || session.metadata?.tier || null;
          await applyStripeSubscriptionEvent({ accountId, subscriptionId: subscription.id, status: subscription.status, tier });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const account = await getAccountByStripeCustomerId(subscription.customer);
        if (account) {
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const tier = tierForPriceId(priceId);
          await applyStripeSubscriptionEvent({ accountId: account.id, subscriptionId: subscription.id, status: subscription.status, tier });
        }
        break;
      }
      default:
        // Unhandled event types are fine to ignore — Stripe expects a 200
        // for anything we don't act on, not an error.
        break;
    }
  } catch (e) {
    console.error(`Stripe webhook handler failed for ${event.type}:`, e.message);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
