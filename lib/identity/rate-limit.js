// Rate limiting, enforced at the identity layer — before any anonymous
// content token is issued, and before any reaction/vote is recorded. See
// architecture doc Section 5 ("Abuse & Brigading Prevention"). Counters are
// per accountId, which means the content service never needs to know about
// limits at all: by the time a request reaches lib/content/service.js, it
// has already passed this check.
import crypto from "node:crypto";
import { identityDb } from "./db.js";

export class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = "RateLimitError";
    this.code = "RATE_LIMITED";
    this.retryAfterMs = retryAfterMs;
  }
}

// Deliberately conservative defaults. Tune per environment once there's
// real traffic data — these are starting points, not measured limits.
export const RATE_LIMITS = {
  post: { max: 5, windowMs: 10 * 60 * 1000, label: "posts" },
  react: { max: 30, windowMs: 60 * 1000, label: "reactions" },
  vote: { max: 20, windowMs: 24 * 60 * 60 * 1000, label: "award votes" },
};

// Rolling window, not a fixed bucket that resets on the clock — "5 posts
// per 10 minutes" always looks back exactly 10 minutes from now, so it
// can't be gamed by timing requests around a reset boundary.
export async function checkRateLimit(accountId, action) {
  const rule = RATE_LIMITS[action];
  if (!rule) throw new Error(`Unknown rate limit action: "${action}"`);

  const windowStartIso = new Date(Date.now() - rule.windowMs).toISOString();
  const { count } = await identityDb.prepare(
    "SELECT COUNT(*) AS count FROM rate_limit_events WHERE account_id = ? AND action = ? AND created_at > ?"
  ).get(accountId, action, windowStartIso);

  if (count >= rule.max) {
    const oldest = await identityDb.prepare(
      `SELECT created_at FROM rate_limit_events
       WHERE account_id = ? AND action = ? AND created_at > ?
       ORDER BY created_at ASC LIMIT 1`
    ).get(accountId, action, windowStartIso);
    const retryAfterMs = oldest
      ? new Date(oldest.created_at).getTime() + rule.windowMs - Date.now()
      : rule.windowMs;
    throw new RateLimitError(
      `Too many ${rule.label} — limit is ${rule.max} per ${Math.round(rule.windowMs / 60000)} min. ` +
      `Try again in ${Math.max(1, Math.ceil(retryAfterMs / 1000))}s.`,
      Math.max(0, retryAfterMs)
    );
  }

  await identityDb.prepare(
    "INSERT INTO rate_limit_events (id, account_id, action, created_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, action, new Date().toISOString());

  return { remaining: rule.max - count - 1 };
}

// Housekeeping — old rows are only ever relevant within their own window,
// so they can be purged well past that. Not called automatically; wire
// into a cron/scheduled task in a real deployment. Safe to run any time.
export async function pruneOldRateLimitEvents(olderThanMs = 7 * 24 * 60 * 60 * 1000) {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  await identityDb.prepare("DELETE FROM rate_limit_events WHERE created_at < ?").run(cutoff);
}
