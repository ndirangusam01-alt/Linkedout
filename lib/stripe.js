// Stripe client. Deliberately lazy — this module is imported by routes that
// run at build time too (Next.js collects route metadata during `next
// build`), and we don't want a missing STRIPE_SECRET_KEY to break the build.
// The error only surfaces when a Stripe call is actually attempted, with a
// message that says exactly what's missing.
import Stripe from "stripe";
export { getAppUrl } from "./config.js";

let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    const err = new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (see README § Stripe setup) to enable real checkout."
    );
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" });
  return _stripe;
}

// Two real paid tiers — Plus and Pro — each its own Stripe Price. Basic
// is free and never touches Stripe at all.
export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PLUS_PRICE_ID && process.env.STRIPE_PRO_PRICE_ID);
}

const TIER_ENV_KEYS = { plus: "STRIPE_PLUS_PRICE_ID", pro: "STRIPE_PRO_PRICE_ID" };

export function getPriceId(tier) {
  const envKey = TIER_ENV_KEYS[tier];
  if (!envKey) throw new Error(`getPriceId: unknown tier "${tier}" (expected "plus" or "pro").`);
  const priceId = process.env[envKey];
  if (!priceId) {
    const err = new Error(`${envKey} is not set. Add the ${tier} plan's Price ID to .env.local.`);
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  return priceId;
}

// Resolves a Stripe Price ID back to our tier name — used by the webhook
// handler, which only knows a subscription's price id, not which of our
// tiers that corresponds to. Returns null for a price id that matches
// neither (defensive — shouldn't happen with a correctly configured
// webhook, but a null here becoming "basic" downstream is much safer
// than accidentally granting Pro).
export function tierForPriceId(priceId) {
  if (priceId === process.env.STRIPE_PLUS_PRICE_ID) return "plus";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return null;
}

export function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    const err = new Error("STRIPE_WEBHOOK_SECRET is not set. Add it to .env.local (see README § Stripe setup).");
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  return secret;
}
