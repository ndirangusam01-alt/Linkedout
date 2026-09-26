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

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function getPriceId() {
  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    const err = new Error("STRIPE_PRICE_ID is not set. Add the Premium plan's Price ID to .env.local.");
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  return priceId;
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
