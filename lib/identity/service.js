// Identity Service. Everything that touches real identity (email, password,
// real name) or the anonymous-id mapping lives behind this file. Nothing
// outside lib/identity/ should import lib/identity/db.js directly.
//
// Two kinds of token come out of here:
//  - session token: { accountId, exp } — used only server-side, to know
//    which account is making a request. Never sent to the content service.
//  - content token: { anonymousId, mode, exp } — the "signed, content-free
//    attestation" described in the architecture doc (Section 2.2). Carries
//    no real identity at all, just proof that *some* verified account is
//    speaking as this anonymous id.
//
// Every exported function here is `async` (and every internal call
// between them is `await`ed) because the underlying store is now
// Postgres (lib/identity/db.js), queried over the network — unlike the
// old node:sqlite version, a query can't complete synchronously. Route
// handlers (app/api/**/route.js) already `await` these calls.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { identityDb } from "./db.js";
import { signToken, verifyToken } from "./crypto.js";
import { sendNotificationEmail } from "../email.js";
import { sendPushToTokens } from "../push.js";
import { randomAlias } from "./alias.js";
import { categoryForType, NOTIFICATION_CATEGORY_KEYS } from "./notification-categories.js";

const NOTIFICATION_PUSH_TITLES = {
  reaction: "New reaction",
  comment: "New reply",
  repost: "New repost",
  poll_vote: "Poll update",
  mention: "You were mentioned",
  follow: "New follower",
  room_joined: "Vent Room activity",
  room_promoted: "You can speak now",
  room_muted: "You've been muted",
  badge: "New badge",
  verification: "Verification update",
  security: "Security alert",
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CONTENT_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes — minted fresh per post

// ---------------- Accounts ----------------

export async function createAccount({ email, password, realName, pseudonym, country, accountType, interests }) {
  const existingEmail = await identityDb.prepare("SELECT id FROM accounts WHERE email = ?").get(email);
  if (existingEmail) {
    const err = new Error("An account with that email already exists.");
    err.code = "EMAIL_TAKEN";
    throw err;
  }
  const existingPseudonym = await identityDb.prepare(
    "SELECT id FROM accounts WHERE lower(pseudonym) = lower(?)"
  ).get(pseudonym);
  if (existingPseudonym) {
    const err = new Error("That pseudonym is already taken — try another.");
    err.code = "PSEUDONYM_TAKEN";
    throw err;
  }
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  await identityDb.prepare(
    `INSERT INTO accounts (id, email, password_hash, real_name, pseudonym, country, account_type, interests, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, email, passwordHash, realName, pseudonym,
    country || null, accountType === "business" ? "business" : "personal",
    JSON.stringify(Array.isArray(interests) ? interests.slice(0, 10) : []),
    new Date().toISOString()
  );
  return getAccountById(id);
}

// OAuth signup has no password and no pseudonym from the provider — a
// pseudonym is still compulsory (see architecture: it's the account's
// default public identity), so one is auto-generated here. The account
// owner can change it any time from profile settings; uniqueness is
// re-checked on that path too (see updateProfile).
async function createOAuthAccount({ email, realName, providerColumn, providerId }) {
  let pseudonym = randomAlias();
  // Extremely unlikely, but guard the random collision anyway.
  while (await identityDb.prepare("SELECT id FROM accounts WHERE lower(pseudonym) = lower(?)").get(pseudonym)) {
    pseudonym = randomAlias();
  }
  const id = crypto.randomUUID();
  await identityDb.prepare(
    `INSERT INTO accounts (id, email, password_hash, real_name, pseudonym, email_verified, ${providerColumn}, created_at)
     VALUES (?, ?, NULL, ?, ?, 1, ?, ?)`
  ).run(id, email, realName, pseudonym, providerId, new Date().toISOString());
  return getAccountById(id);
}

export async function findOrCreateGoogleAccount({ googleId, email, realName }) {
  const byGoogle = await identityDb.prepare("SELECT id FROM accounts WHERE google_id = ?").get(googleId);
  if (byGoogle) return getAccountById(byGoogle.id);

  const byEmail = await identityDb.prepare("SELECT id FROM accounts WHERE email = ?").get(email);
  if (byEmail) {
    // Same email, first time via Google — link the accounts rather than
    // creating a duplicate.
    await identityDb.prepare("UPDATE accounts SET google_id = ?, email_verified = 1 WHERE id = ?").run(googleId, byEmail.id);
    return getAccountById(byEmail.id);
  }

  return createOAuthAccount({ email, realName, providerColumn: "google_id", providerId: googleId });
}

export async function findOrCreateAppleAccount({ appleId, email, realName }) {
  const byApple = await identityDb.prepare("SELECT id FROM accounts WHERE apple_id = ?").get(appleId);
  if (byApple) return getAccountById(byApple.id);

  const byEmail = await identityDb.prepare("SELECT id FROM accounts WHERE email = ?").get(email);
  if (byEmail) {
    await identityDb.prepare("UPDATE accounts SET apple_id = ?, email_verified = 1 WHERE id = ?").run(appleId, byEmail.id);
    return getAccountById(byEmail.id);
  }

  return createOAuthAccount({ email, realName, providerColumn: "apple_id", providerId: appleId });
}

export async function verifyCredentials(email, password) {
  const row = await identityDb.prepare("SELECT * FROM accounts WHERE email = ?").get(email);
  if (!row || !row.password_hash) return null; // OAuth-only accounts have no password to check
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) return null;
  return getAccountById(row.id);
}

export async function changePassword(accountId, currentPassword, newPassword) {
  const row = await identityDb.prepare("SELECT password_hash FROM accounts WHERE id = ?").get(accountId);
  if (!row) throw new Error("Account not found.");
  if (row.password_hash) {
    const ok = await bcrypt.compare(currentPassword, row.password_hash);
    if (!ok) {
      const err = new Error("Current password is incorrect.");
      err.code = "WRONG_PASSWORD";
      throw err;
    }
  }
  const newHash = await bcrypt.hash(newPassword, 10);
  await identityDb.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(newHash, accountId);
  await createNotification(accountId, "security", "Your password was changed. If this wasn't you, contact support immediately.");
}

export async function getAccountById(accountId) {
  const row = await identityDb.prepare(
    `SELECT id, email, real_name, pseudonym, bio, avatar_path, email_verified, google_id, apple_id,
            password_hash, is_premium, stripe_customer_id, stripe_subscription_id, subscription_status,
            phone, phone_verified, country, account_type, interests,
            government_id_status, business_verified_status, professional_verified_status, created_at
     FROM accounts WHERE id = ?`
  ).get(accountId);
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    realName: row.real_name,
    pseudonym: row.pseudonym,
    bio: row.bio || "",
    avatarPath: row.avatar_path,
    emailVerified: !!row.email_verified,
    hasGoogle: !!row.google_id,
    hasApple: !!row.apple_id,
    hasPassword: !!row.password_hash,
    isPremium: !!row.is_premium,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    subscriptionStatus: row.subscription_status,
    phone: row.phone,
    phoneVerified: !!row.phone_verified,
    country: row.country,
    accountType: row.account_type,
    interests: JSON.parse(row.interests || "[]"),
    governmentIdStatus: row.government_id_status,
    businessVerifiedStatus: row.business_verified_status,
    professionalVerifiedStatus: row.professional_verified_status,
    createdAt: row.created_at,
  };
}

export async function getAccountByPseudonym(pseudonym) {
  const row = await identityDb.prepare("SELECT id FROM accounts WHERE lower(pseudonym) = lower(?)").get(pseudonym);
  if (!row) return null;
  return getAccountById(row.id);
}

// Public username search — pseudonym only, never email/real name. Used by
// the search page's "People" tab.
export async function searchAccountsByPseudonym(query) {
  const rows = await identityDb.prepare(
    "SELECT id, pseudonym, avatar_path, bio FROM accounts WHERE pseudonym LIKE ? ORDER BY pseudonym LIMIT 10"
  ).all(`%${query}%`);
  return rows.map((r) => ({
    pseudonym: r.pseudonym,
    // Full object-storage URL, stored directly — see lib/avatars.js.
    avatarUrl: r.avatar_path || null,
    bio: r.bio || "",
  }));
}

export async function getAccountByStripeCustomerId(customerId) {
  const row = await identityDb.prepare("SELECT id FROM accounts WHERE stripe_customer_id = ?").get(customerId);
  if (!row) return null;
  return getAccountById(row.id);
}

// The one shape of "current user" every client-facing route returns —
// used by /api/auth/me and /api/profile so the two never quietly drift
// out of sync with each other.
export async function serializeAccountForClient(account) {
  return {
    email: account.email,
    realName: account.realName,
    pseudonym: account.pseudonym,
    bio: account.bio,
    // Full object-storage URL, stored directly — see lib/avatars.js.
    avatarUrl: account.avatarPath || null,
    emailVerified: account.emailVerified,
    hasGoogle: account.hasGoogle,
    hasApple: account.hasApple,
    hasPassword: account.hasPassword,
    isPremium: account.isPremium,
    phone: account.phone,
    phoneVerified: account.phoneVerified,
    country: account.country,
    accountType: account.accountType,
    interests: account.interests,
    governmentIdStatus: account.governmentIdStatus,
    businessVerifiedStatus: account.businessVerifiedStatus,
    professionalVerifiedStatus: account.professionalVerifiedStatus,
    badges: await getBadges(account.id),
    cooldowns: await getProfileChangeCooldowns(account.id),
    createdAt: account.createdAt,
  };
}

// ---------------- Profile: pseudonym, bio, avatar ----------------

const PSEUDONYM_COOLDOWN_DAYS = 14;
const REAL_NAME_COOLDOWN_DAYS = 14;

function cooldownRemaining(lastChangedAt, cooldownDays) {
  if (!lastChangedAt) return null;
  const nextAllowed = new Date(lastChangedAt).getTime() + cooldownDays * 24 * 60 * 60 * 1000;
  const remainingMs = nextAllowed - Date.now();
  if (remainingMs <= 0) return null;
  return { nextAllowedAt: new Date(nextAllowed).toISOString(), remainingDays: Math.ceil(remainingMs / (24 * 60 * 60 * 1000)) };
}

export async function updateProfile(accountId, { pseudonym, bio, realName, country, accountType, interests }) {
  const current = await identityDb.prepare(
    "SELECT pseudonym, real_name, pseudonym_changed_at, real_name_changed_at FROM accounts WHERE id = ?"
  ).get(accountId);

  if (pseudonym !== undefined && pseudonym !== current.pseudonym) {
    const cooldown = cooldownRemaining(current.pseudonym_changed_at, PSEUDONYM_COOLDOWN_DAYS);
    if (cooldown) {
      const err = new Error(
        `You can change your pseudonym again in ${cooldown.remainingDays} day${cooldown.remainingDays === 1 ? "" : "s"} (on ${new Date(cooldown.nextAllowedAt).toLocaleDateString()}). This limit keeps other people from being impersonated by a fast-changing username.`
      );
      err.code = "PSEUDONYM_COOLDOWN";
      err.nextAllowedAt = cooldown.nextAllowedAt;
      throw err;
    }
    const clash = await identityDb.prepare(
      "SELECT id FROM accounts WHERE lower(pseudonym) = lower(?) AND id != ?"
    ).get(pseudonym, accountId);
    if (clash) {
      const err = new Error("That pseudonym is already taken — try another.");
      err.code = "PSEUDONYM_TAKEN";
      throw err;
    }
    await identityDb.prepare("UPDATE accounts SET pseudonym = ?, pseudonym_changed_at = ? WHERE id = ?")
      .run(pseudonym, new Date().toISOString(), accountId);
  }
  if (bio !== undefined) {
    await identityDb.prepare("UPDATE accounts SET bio = ? WHERE id = ?").run(bio.slice(0, 280), accountId);
  }
  if (realName !== undefined && realName.trim() && realName.trim() !== current.real_name) {
    const cooldown = cooldownRemaining(current.real_name_changed_at, REAL_NAME_COOLDOWN_DAYS);
    if (cooldown) {
      const err = new Error(
        `You can change your real name again in ${cooldown.remainingDays} day${cooldown.remainingDays === 1 ? "" : "s"} (on ${new Date(cooldown.nextAllowedAt).toLocaleDateString()}).`
      );
      err.code = "REAL_NAME_COOLDOWN";
      err.nextAllowedAt = cooldown.nextAllowedAt;
      throw err;
    }
    await identityDb.prepare("UPDATE accounts SET real_name = ?, real_name_changed_at = ? WHERE id = ?")
      .run(realName.trim(), new Date().toISOString(), accountId);
  }
  if (country !== undefined) {
    await identityDb.prepare("UPDATE accounts SET country = ? WHERE id = ?").run(country || null, accountId);
  }
  if (accountType !== undefined) {
    await identityDb.prepare("UPDATE accounts SET account_type = ? WHERE id = ?").run(accountType === "business" ? "business" : "personal", accountId);
  }
  if (interests !== undefined) {
    await identityDb.prepare("UPDATE accounts SET interests = ? WHERE id = ?").run(
      JSON.stringify(Array.isArray(interests) ? interests.slice(0, 10) : []), accountId
    );
  }
  return getAccountById(accountId);
}

// How long until this account could change its pseudonym/real name again —
// exposed so Settings can show "next allowed" dates before the user even
// tries, rather than only finding out via a rejected submission.
export async function getProfileChangeCooldowns(accountId) {
  const row = await identityDb.prepare(
    "SELECT pseudonym_changed_at, real_name_changed_at FROM accounts WHERE id = ?"
  ).get(accountId);
  return {
    pseudonym: cooldownRemaining(row.pseudonym_changed_at, PSEUDONYM_COOLDOWN_DAYS),
    realName: cooldownRemaining(row.real_name_changed_at, REAL_NAME_COOLDOWN_DAYS),
  };
}

// ---------------- Deactivation (reversible) vs. deletion (permanent) ----------------
// X-style pattern: deactivating blocks login and hides the account from
// itself; logging back in within the grace period reactivates it
// automatically (see verifyCredentials's caller in the login route).
// Distinct from deleteAccount (permanent, irreversible, already existed).

export async function deactivateAccount(accountId) {
  await identityDb.prepare("UPDATE accounts SET deactivated = 1, deactivated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), accountId);
}

export async function reactivateAccount(accountId) {
  await identityDb.prepare("UPDATE accounts SET deactivated = 0, deactivated_at = NULL WHERE id = ?").run(accountId);
}

export async function isAccountDeactivated(accountId) {
  const row = await identityDb.prepare("SELECT deactivated FROM accounts WHERE id = ?").get(accountId);
  return !!row?.deactivated;
}

// ---------------- Data export (self-service) ----------------
// Everything this account itself is entitled to see about itself —
// identity fields plus whatever the content service can find via this
// account's own anonymous ids. Assembled at the route layer (see
// /api/profile/export) since it needs both services; this function only
// covers the identity half.
export async function exportIdentityData(accountId) {
  const account = await getAccountById(accountId);
  const anonymousIds = await getAnonymousIdsForAccount(accountId);
  const badges = await getBadges(accountId);
  const verificationRequests = await getVerificationRequestsForAccount(accountId);
  return {
    profile: {
      email: account.email,
      realName: account.realName,
      pseudonym: account.pseudonym,
      bio: account.bio,
      country: account.country,
      accountType: account.accountType,
      interests: account.interests,
      emailVerified: account.emailVerified,
      phoneVerified: account.phoneVerified,
      isPremium: account.isPremium,
      createdAt: account.createdAt,
    },
    badges,
    verificationRequests: verificationRequests.map((r) => ({
      type: r.type, status: r.status, submittedData: r.submitted_data, createdAt: r.created_at,
    })),
    anonymousIdCount: anonymousIds.length,
  };
}

// avatar_path stores the FULL object-storage URL (public bucket) — see
// lib/avatars.js. Column name kept from the pre-migration on-disk-path
// era to avoid an unrelated rename.
export async function setAvatarPath(accountId, avatarPath) {
  await identityDb.prepare("UPDATE accounts SET avatar_path = ? WHERE id = ?").run(avatarPath, accountId);
  return getAccountById(accountId);
}

export async function clearAvatarPath(accountId) {
  return setAvatarPath(accountId, null);
}

export async function deleteAccount(accountId) {
  // Deletes the account and everything that identifies it. Does NOT (and
  // cannot, by design) delete posts already made under an anonymous_id in
  // the content store — those were never linked to this account in the
  // first place. This mirrors the GDPR-style behavior already documented
  // elsewhere: deleting an identity doesn't retroactively delete
  // already-anonymous content.
  await identityDb.prepare("DELETE FROM notifications WHERE account_id = ?").run(accountId);
  await identityDb.prepare("DELETE FROM rate_limit_events WHERE account_id = ?").run(accountId);
  await identityDb.prepare("DELETE FROM email_verifications WHERE account_id = ?").run(accountId);
  await identityDb.prepare("DELETE FROM password_resets WHERE account_id = ?").run(accountId);
  await identityDb.prepare("DELETE FROM anonymous_identities WHERE account_id = ?").run(accountId);
  await identityDb.prepare("DELETE FROM accounts WHERE id = ?").run(accountId);
  // billing_events and audit_log are intentionally kept — financial and
  // security audit trails outliving the account they reference is
  // standard practice, not an oversight.
}

// ---------------- Sessions ----------------

export function signSession(accountId) {
  return signToken({ accountId, exp: Date.now() + SESSION_TTL_MS });
}

export function verifySession(token) {
  const payload = verifyToken(token);
  if (!payload || !payload.accountId) return null;
  return payload.accountId;
}

// ---------------- Anonymous identities ----------------

// "alias" mode: uses the account's own chosen pseudonym (compulsory at
// signup — see createAccount) as the display name, every time. A single
// persistent anonymous_id is still minted once and reused, exactly as
// before — that's what keeps the content store from ever needing an
// account_id column. What changed is where the *display name* comes
// from: it's read fresh from accounts.pseudonym on every call, not
// frozen into anonymous_identities at creation time. That means changing
// your pseudonym in settings changes your name on future alias posts
// immediately — but, deliberately, never rewrites posts already made
// (the content store keeps the text as it was at post time and has no
// way to look it up again even if it wanted to).
export async function getOrCreateAlias(accountId) {
  const account = await getAccountById(accountId);
  const displayLabel = account?.pseudonym || "Anonymous";

  const existing = await identityDb.prepare(
    "SELECT * FROM anonymous_identities WHERE account_id = ? AND mode = 'alias'"
  ).get(accountId);
  if (existing) return { anonymousId: existing.anonymous_id, displayLabel };

  const anonymousId = crypto.randomUUID();
  await identityDb.prepare(
    "INSERT INTO anonymous_identities (anonymous_id, account_id, mode, display_label, created_at) VALUES (?, ?, 'alias', ?, ?)"
  ).run(anonymousId, accountId, displayLabel, new Date().toISOString());
  return { anonymousId, displayLabel };
}

// Public, read-only lookup for the "click an author's name" feature —
// deliberately the ONLY thing the content service is allowed to ask the
// identity service for a given anonymous_id, and it only ever answers
// for 'alias' mode. 'anon' mode identities are minted fresh per post and
// never reused (see issueEphemeralIdentity above) specifically so they
// can't be linked together — this function enforces that same guarantee
// by refusing to resolve anything but a stable alias handle, so a public
// profile page can never be built for a fully-anonymous post.
export async function getAliasHandle(anonymousId) {
  if (!anonymousId) return null;
  const row = await identityDb.prepare(
    `SELECT ai.display_label, a.avatar_path
     FROM anonymous_identities ai
     LEFT JOIN accounts a ON a.id = ai.account_id
     WHERE ai.anonymous_id = ? AND ai.mode = 'alias'`
  ).get(anonymousId);
  if (!row) return null;
  return {
    anonymousId,
    displayLabel: row.display_label,
    // Their own chosen avatar for this persona — safe to show (full
    // object-storage URL, stored directly — see lib/avatars.js) because
    // the alias identity is already stable/reused (that's what makes it
    // an alias rather than an anon id); it never reveals which account
    // it belongs to.
    avatarUrl: row.avatar_path || null,
  };
}

// Resolves an alias anonymous_id to its owning account id — used only by
// the avatar route above. Same refusal-by-construction as getAliasHandle:
// null for anything that isn't 'alias' mode.
export async function resolveAliasAccountId(anonymousId) {
  const row = await identityDb.prepare(
    "SELECT account_id FROM anonymous_identities WHERE anonymous_id = ? AND mode = 'alias'"
  ).get(anonymousId);
  return row?.account_id || null;
}

// ---------------- Follows ----------------
// A comprehensive-but-honest follow system: follows target a stable
// alias handle (never an account id, never a real name, never an
// anon-mode id — see follows' own table comment), and the *follower's*
// own identity is always shown to the followed account (and in any
// follower list) via that follower's own alias, never their real name,
// so following someone doesn't cross the identity/content boundary any
// more than posting under an alias already does.

export async function followHandle(followerAccountId, targetHandle) {
  const target = await getAliasHandle(targetHandle);
  if (!target) {
    const err = new Error("That profile doesn't exist.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const targetAccountId = await resolveAliasAccountId(targetHandle);
  if (targetAccountId === followerAccountId) {
    const err = new Error("You can't follow yourself.");
    err.code = "SELF_FOLLOW";
    throw err;
  }
  const already = await identityDb.prepare(
    "SELECT 1 FROM follows WHERE follower_account_id = ? AND followed_handle = ?"
  ).get(followerAccountId, targetHandle);
  if (already) return { following: true };

  await identityDb.prepare(
    "INSERT INTO follows (follower_account_id, followed_handle, created_at) VALUES (?, ?, ?)"
  ).run(followerAccountId, targetHandle, new Date().toISOString());

  if (targetAccountId) {
    const followerAlias = await getOrCreateAlias(followerAccountId);
    await createNotification(targetAccountId, "follow", `${followerAlias.displayLabel} started following you.`);
  }
  return { following: true };
}

export async function unfollowHandle(followerAccountId, targetHandle) {
  await identityDb.prepare(
    "DELETE FROM follows WHERE follower_account_id = ? AND followed_handle = ?"
  ).run(followerAccountId, targetHandle);
  return { following: false };
}

export async function isFollowing(followerAccountId, targetHandle) {
  if (!followerAccountId) return false;
  return Boolean(await identityDb.prepare(
    "SELECT 1 FROM follows WHERE follower_account_id = ? AND followed_handle = ?"
  ).get(followerAccountId, targetHandle));
}

export async function getFollowerCount(targetHandle) {
  return (await identityDb.prepare("SELECT COUNT(*) AS n FROM follows WHERE followed_handle = ?").get(targetHandle)).n;
}

export async function getFollowingCount(accountId) {
  return (await identityDb.prepare("SELECT COUNT(*) AS n FROM follows WHERE follower_account_id = ?").get(accountId)).n;
}

// Returns each follower's OWN alias display (never the follower's real
// name) — see this section's own comment for why.
export async function getFollowersForHandle(targetHandle, { limit = 50 } = {}) {
  const rows = await identityDb.prepare(
    "SELECT follower_account_id, created_at FROM follows WHERE followed_handle = ? ORDER BY created_at DESC LIMIT ?"
  ).all(targetHandle, limit);
  return Promise.all(rows.map(async (r) => {
    const alias = await getOrCreateAlias(r.follower_account_id);
    return { handle: alias.anonymousId, displayLabel: alias.displayLabel, followedAt: r.created_at };
  }));
}

// The handles a given account follows — used for "following" feed
// filtering and for excluding already-followed people from suggestions.
export async function getFollowingForAccount(accountId, { limit = 200 } = {}) {
  const rows = await identityDb.prepare(
    "SELECT followed_handle, created_at FROM follows WHERE follower_account_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(accountId, limit);
  const resolved = await Promise.all(rows.map(async (r) => {
    const alias = await getAliasHandle(r.followed_handle);
    return alias ? { handle: r.followed_handle, displayLabel: alias.displayLabel, avatarUrl: alias.avatarUrl, followedAt: r.created_at } : null;
  }));
  return resolved.filter(Boolean);
}

// "People you may know" — a plain, explainable popularity ranking
// (most-followed aliases the viewer doesn't already follow), not a
// black-box model. Consistent with this app's "no hidden algorithm"
// stance: the ranking signal is named in the UI (see FollowSuggestions
// components), and it's the only ranking signal — no engagement
// profiling, no behavioral tracking.
export async function getSuggestedHandles(accountId, { limit = 6 } = {}) {
  const following = accountId ? await getFollowingForAccount(accountId, { limit: 1000 }) : [];
  const alreadyFollowing = new Set(following.map((f) => f.handle));
  const rows = await identityDb.prepare(
    `SELECT ai.anonymous_id AS handle, ai.display_label AS "displayLabel", a.avatar_path,
            (SELECT COUNT(*) FROM follows f WHERE f.followed_handle = ai.anonymous_id) AS "followerCount"
     FROM anonymous_identities ai
     JOIN accounts a ON a.id = ai.account_id
     WHERE ai.mode = 'alias' AND ai.account_id != ?
     ORDER BY "followerCount" DESC, ai.created_at DESC
     LIMIT ?`
  ).all(accountId || "", limit + alreadyFollowing.size);
  return rows
    .filter((r) => !alreadyFollowing.has(r.handle))
    .slice(0, limit)
    .map((r) => ({
      handle: r.handle, displayLabel: r.displayLabel, followerCount: r.followerCount,
      // Full object-storage URL, stored directly — see lib/avatars.js.
      avatarUrl: r.avatar_path || null,
    }));
}

const ANON_NOUNS = ["Wolf", "Otter", "Raccoon", "Badger", "Pigeon", "Ferret", "Crow"];
export async function issueEphemeralIdentity(accountId) {
  const anonymousId = crypto.randomUUID();
  const displayLabel = `Anonymous ${ANON_NOUNS[Math.floor(Math.random() * ANON_NOUNS.length)]}`;
  await identityDb.prepare(
    "INSERT INTO anonymous_identities (anonymous_id, account_id, mode, display_label, created_at) VALUES (?, ?, 'anon', ?, ?)"
  ).run(anonymousId, accountId, displayLabel, new Date().toISOString());
  return { anonymousId, displayLabel };
}

// "real" mode: no anonymous id at all — the account's real name is used
// directly as the display author. Still routed through this service so the
// content layer has one consistent call shape regardless of mode.
export async function getRealIdentity(accountId) {
  const account = await getAccountById(accountId);
  return { anonymousId: null, displayLabel: account ? account.realName : "Unknown" };
}

// Issues the short-lived, content-facing attestation token for a given
// identity mode. The content service only ever sees this token's payload
// (anonymousId + mode) — never the account id, email, or real name, unless
// mode is "real", by the poster's own explicit choice.
export async function issueContentToken(accountId, mode) {
  let identity;
  if (mode === "real") identity = await getRealIdentity(accountId);
  else if (mode === "alias") identity = await getOrCreateAlias(accountId);
  else identity = await issueEphemeralIdentity(accountId);

  const token = signToken({
    anonymousId: identity.anonymousId,
    displayLabel: identity.displayLabel,
    mode,
    exp: Date.now() + CONTENT_TOKEN_TTL_MS,
  });
  return { token, ...identity };
}

export function verifyContentToken(token) {
  const payload = verifyToken(token);
  if (!payload || !payload.mode) return null;
  return payload;
}

// ---------------- Premium / billing ----------------
//
// Two paths update premium status:
//  - Mock checkout (setPremiumStatus): flips the flag directly, no Stripe
//    involved. Used when Stripe isn't configured, or for local testing.
//  - Real Stripe flow (setStripeCustomerId + applyStripeSubscriptionEvent):
//    driven entirely by webhook events after Stripe confirms payment — see
//    app/api/stripe/webhook/route.js. Never called directly from a
//    client-triggered route.
export async function setPremiumStatus(accountId, isPremium) {
  await identityDb.prepare("UPDATE accounts SET is_premium = ? WHERE id = ?").run(isPremium ? 1 : 0, accountId);
  await identityDb.prepare(
    "INSERT INTO billing_events (id, account_id, event, created_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, isPremium ? "upgrade" : "downgrade", new Date().toISOString());
  if (isPremium) await checkAndAwardBadges(accountId);
  return getAccountById(accountId);
}

export async function setStripeCustomerId(accountId, customerId) {
  await identityDb.prepare("UPDATE accounts SET stripe_customer_id = ? WHERE id = ?").run(customerId, accountId);
  await identityDb.prepare(
    "INSERT INTO billing_events (id, account_id, event, created_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, "stripe_customer_created", new Date().toISOString());
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

// Called only from the Stripe webhook handler, once a subscription's
// status is known for certain — this is the single place is_premium gets
// set to true or false based on real payment state.
export async function applyStripeSubscriptionEvent({ accountId, subscriptionId, status }) {
  const isPremium = ACTIVE_STATUSES.has(status);
  await identityDb.prepare(
    "UPDATE accounts SET is_premium = ?, stripe_subscription_id = ?, subscription_status = ? WHERE id = ?"
  ).run(isPremium ? 1 : 0, subscriptionId, status, accountId);
  await identityDb.prepare(
    "INSERT INTO billing_events (id, account_id, event, created_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, `stripe_subscription_${status}`, new Date().toISOString());
  if (isPremium) await checkAndAwardBadges(accountId);
  return getAccountById(accountId);
}

export async function getBillingEvents(accountId) {
  return identityDb.prepare(
    "SELECT event, created_at FROM billing_events WHERE account_id = ? ORDER BY created_at DESC"
  ).all(accountId);
}

// ---------------- Break-glass (two-person, not exposed via any HTTP route) ----------------
//
// No single function here can resolve an anonymous id on its own anymore.
// requestBreakGlass() only records intent; approveBreakGlass() requires a
// *different* operator and a still-valid (unexpired) request before the
// lookup happens. See scripts/break-glass-request.js,
// scripts/break-glass-approve.js, and architecture doc Section 2.4.
const BREAK_GLASS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function requestBreakGlass(anonymousId, reason, requestedBy) {
  if (!anonymousId || !reason || !requestedBy) {
    throw new Error("requestBreakGlass requires anonymousId, reason, and requestedBy — no silent lookups.");
  }
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BREAK_GLASS_EXPIRY_MS);
  await identityDb.prepare(
    `INSERT INTO break_glass_requests (id, anonymous_id, reason, requested_by, status, requested_at, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(id, anonymousId, reason, requestedBy, now.toISOString(), expiresAt.toISOString());
  return getBreakGlassRequest(id);
}

export async function getBreakGlassRequest(id) {
  return (await identityDb.prepare("SELECT * FROM break_glass_requests WHERE id = ?").get(id)) || null;
}

export async function listPendingBreakGlassRequests() {
  return identityDb.prepare(
    "SELECT * FROM break_glass_requests WHERE status = 'pending' ORDER BY requested_at DESC"
  ).all();
}

// Approves a pending request and performs the actual identity lookup in
// the same step, so there is no window where an "approved" request sits
// around unresolved. Enforces:
//   - the request exists and is still 'pending'
//   - it hasn't expired
//   - approvedBy is a different operator than requestedBy
export async function approveBreakGlass(requestId, approvedBy) {
  if (!approvedBy) throw new Error("approveBreakGlass requires an approvedBy operator id.");

  const request = await getBreakGlassRequest(requestId);
  if (!request) {
    const err = new Error("No break-glass request with that id.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error(`Request is already '${request.status}', not pending.`);
    err.code = "NOT_PENDING";
    throw err;
  }
  if (new Date(request.expires_at).getTime() < Date.now()) {
    await identityDb.prepare("UPDATE break_glass_requests SET status = 'expired' WHERE id = ?").run(requestId);
    const err = new Error("This request expired. File a new one with scripts/break-glass-request.js.");
    err.code = "EXPIRED";
    throw err;
  }
  if (approvedBy.trim().toLowerCase() === request.requested_by.trim().toLowerCase()) {
    const err = new Error("The approver must be a different operator than the requester — two-person rule.");
    err.code = "SAME_OPERATOR";
    throw err;
  }

  const now = new Date().toISOString();
  await identityDb.prepare(
    "UPDATE break_glass_requests SET status = 'resolved', approved_by = ?, approved_at = ? WHERE id = ?"
  ).run(approvedBy, now, requestId);

  await identityDb.prepare(
    "INSERT INTO audit_log (id, anonymous_id, reason, requested_by, resolved_by, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), request.anonymous_id, request.reason, request.requested_by, approvedBy, now);

  const mapping = await identityDb.prepare(
    "SELECT account_id FROM anonymous_identities WHERE anonymous_id = ?"
  ).get(request.anonymous_id);
  if (!mapping) return { account: null, request: await getBreakGlassRequest(requestId) };
  return { account: await getAccountById(mapping.account_id), request: await getBreakGlassRequest(requestId) };
}

export async function getAuditLog() {
  return identityDb.prepare("SELECT * FROM audit_log ORDER BY created_at DESC").all();
}

// ---------------- Internal routing lookup (NOT break-glass) ----------------
//
// This is deliberately a different function, with a different name and a
// different purpose, from resolveIdentity/approveBreakGlass above. It
// exists for exactly one legitimate internal use — delivering a
// notification into the right account's private inbox (see
// notifyOwnerOfAnonymousId below) — and it never surfaces the account it
// finds to any human, in any API response, anywhere. Nothing about
// "someone reacted to your post" reveals who reacted; this function only
// tells the server which inbox to put that message in.
//
// This is NOT a loophole around break-glass: break-glass exists to control
// *revealing a real identity to a person* (a moderator, an investigator).
// This function never does that — its output is consumed by the server,
// immediately, to write one row to notifications, and is not retained or
// exposed anywhere.
async function getAccountIdForRouting(anonymousId) {
  const row = await identityDb.prepare(
    "SELECT account_id FROM anonymous_identities WHERE anonymous_id = ?"
  ).get(anonymousId);
  return row ? row.account_id : null;
}

// ---------------- Email verification ----------------

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createEmailVerificationToken(accountId) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
  await identityDb.prepare(
    "INSERT INTO email_verifications (id, account_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, token, now.toISOString(), expiresAt.toISOString());
  return token;
}

export async function verifyEmailToken(token) {
  const row = await identityDb.prepare("SELECT * FROM email_verifications WHERE token = ?").get(token);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  await identityDb.prepare("UPDATE email_verifications SET used = 1 WHERE id = ?").run(row.id);
  await identityDb.prepare("UPDATE accounts SET email_verified = 1 WHERE id = ?").run(row.account_id);
  await checkAndAwardBadges(row.account_id);
  return { ok: true, accountId: row.account_id };
}

// ---------------- Password reset ----------------

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour — shorter-lived than email verification on purpose

// Always safe to call with any email — returns null (no token, no error)
// if the email doesn't match an account, so the calling route can return
// the same generic "if that email exists..." response either way and
// never let this become a way to enumerate registered emails.
export async function createPasswordResetToken(email) {
  const account = await identityDb.prepare("SELECT id FROM accounts WHERE email = ?").get(email);
  if (!account) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  await identityDb.prepare(
    "INSERT INTO password_resets (id, account_id, token, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), account.id, token, now.toISOString(), expiresAt.toISOString());
  return { token, accountId: account.id };
}

export async function resetPasswordWithToken(token, newPassword) {
  const row = await identityDb.prepare("SELECT * FROM password_resets WHERE token = ?").get(token);
  if (!row) return { ok: false, reason: "invalid" };
  if (row.used) return { ok: false, reason: "used" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };

  const newHash = await bcrypt.hash(newPassword, 10);
  await identityDb.prepare("UPDATE accounts SET password_hash = ? WHERE id = ?").run(newHash, row.account_id);
  await identityDb.prepare("UPDATE password_resets SET used = 1 WHERE id = ?").run(row.id);
  await createNotification(row.account_id, "security", "Your password was reset. If this wasn't you, contact support immediately.");
  return { ok: true, accountId: row.account_id };
}

// ---------------- Notifications ----------------

export async function getNotificationPreferences(accountId) {
  const rows = await identityDb.prepare("SELECT * FROM notification_preferences WHERE account_id = ?").all(accountId);
  const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));
  // Any category without a stored row defaults to all-channels-on — see
  // the notification_preferences table's own comment for why we don't
  // pre-populate a row per category at account creation.
  return Object.fromEntries(
    NOTIFICATION_CATEGORY_KEYS.map((cat) => [
      cat,
      byCategory[cat]
        ? { inApp: !!byCategory[cat].in_app, email: !!byCategory[cat].email, push: !!byCategory[cat].push }
        : { inApp: true, email: true, push: true },
    ])
  );
}

export async function setNotificationPreference(accountId, category, { inApp, email, push }) {
  if (!NOTIFICATION_CATEGORY_KEYS.includes(category)) throw new Error(`Unknown notification category: ${category}`);
  const current = (await getNotificationPreferences(accountId))[category];
  const next = {
    inApp: inApp === undefined ? current.inApp : inApp,
    email: email === undefined ? current.email : email,
    push: push === undefined ? current.push : push,
  };
  await identityDb.prepare(
    `INSERT INTO notification_preferences (account_id, category, in_app, email, push)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(account_id, category) DO UPDATE SET in_app = excluded.in_app, email = excluded.email, push = excluded.push`
  ).run(accountId, category, next.inApp ? 1 : 0, next.email ? 1 : 0, next.push ? 1 : 0);
  return next;
}

// ---------------- Push tokens ----------------

export async function registerPushToken(accountId, token, platform) {
  await identityDb.prepare(
    `INSERT INTO push_tokens (id, account_id, token, platform, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET account_id = excluded.account_id, platform = excluded.platform`
  ).run(crypto.randomUUID(), accountId, token, platform || null, new Date().toISOString());
}

export async function unregisterPushToken(token) {
  await identityDb.prepare("DELETE FROM push_tokens WHERE token = ?").run(token);
}

async function getPushTokensForAccount(accountId) {
  const rows = await identityDb.prepare("SELECT token FROM push_tokens WHERE account_id = ?").all(accountId);
  return rows.map((r) => r.token);
}

async function pruneInvalidPushTokens(tokens) {
  if (!tokens || tokens.length === 0) return;
  const stmt = identityDb.prepare("DELETE FROM push_tokens WHERE token = ?");
  for (const t of tokens) await stmt.run(t);
}

export async function createNotification(accountId, type, message, relatedPostId = null) {
  const category = categoryForType(type);
  const prefs = (await getNotificationPreferences(accountId))[category];

  // The in-app notification is the source of truth and the one channel
  // that's always safe to skip quietly if someone's turned a category
  // off — email/push below check the same preference object so all
  // three channels respect one on/off switch per category.
  if (prefs.inApp) {
    await identityDb.prepare(
      "INSERT INTO notifications (id, account_id, type, message, related_post_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), accountId, type, message, relatedPostId, new Date().toISOString());
  }

  // Fire-and-forget: email/push delivery must never block or fail the
  // action (a reaction, a comment...) that triggered the notification.
  if (prefs.email) {
    const account = await identityDb.prepare("SELECT email FROM accounts WHERE id = ?").get(accountId);
    if (account?.email) {
      sendNotificationEmail(account.email, type, message, relatedPostId).catch(() => {});
    }
  }
  if (prefs.push) {
    const tokens = await getPushTokensForAccount(accountId);
    if (tokens.length > 0) {
      sendPushToTokens(tokens, {
        title: NOTIFICATION_PUSH_TITLES[type] || "LinkedOut",
        body: message,
        data: { type, relatedPostId },
        category,
      }).then(({ invalidTokens }) => pruneInvalidPushTokens(invalidTokens)).catch(() => {});
    }
  }
}

// The one legitimate caller of getAccountIdForRouting(): given the
// anonymous_id a reaction/vote landed on, deliver a notification to
// whoever owns it, without ever exposing who the *reactor* was, and
// without exposing the *recipient's* identity to anyone either — the
// notification just appears in their own private inbox.
export async function notifyOwnerOfAnonymousId(anonymousId, type, message, relatedPostId, excludeAccountId = null) {
  const ownerAccountId = await getAccountIdForRouting(anonymousId);
  if (!ownerAccountId) return;
  if (excludeAccountId && ownerAccountId === excludeAccountId) return; // don't notify yourself
  await createNotification(ownerAccountId, type, message, relatedPostId);
}

export async function getNotifications(accountId, { limit = 50 } = {}) {
  const rows = await identityDb.prepare(
    "SELECT * FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT ?"
  ).all(accountId, limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    category: categoryForType(row.type),
    message: row.message,
    relatedPostId: row.related_post_id,
    read: !!row.read,
    createdAt: row.created_at,
  }));
}

export async function getUnreadNotificationCount(accountId) {
  return (await identityDb.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE account_id = ? AND read = 0"
  ).get(accountId)).n;
}

export async function markNotificationRead(id, accountId) {
  await identityDb.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND account_id = ?").run(id, accountId);
}

export async function markAllNotificationsRead(accountId) {
  await identityDb.prepare("UPDATE notifications SET read = 1 WHERE account_id = ?").run(accountId);
}

// ---------------- "My posts" (self-service, not break-glass) ----------------
//
// Different from getAccountIdForRouting/break-glass in the opposite
// direction: this answers "what anonymous_ids belong to *my own,
// currently-authenticated* account", so the account's own profile page
// can show its own post history. This is standard self-service data
// access (the account asking for its own data), not a third party
// unmasking someone else — it doesn't need break-glass's two-person
// control, the same way "show me my own order history" on a shopping
// site doesn't need a manager's approval.
export async function getAnonymousIdsForAccount(accountId) {
  const rows = await identityDb.prepare(
    "SELECT anonymous_id FROM anonymous_identities WHERE account_id = ?"
  ).all(accountId);
  return rows.map((row) => row.anonymous_id);
}

// ---------------- Phone verification ----------------

const PHONE_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PHONE_MAX_ATTEMPTS = 5;

export async function requestPhoneVerification(accountId, phone) {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PHONE_CODE_TTL_MS);
  await identityDb.prepare("UPDATE accounts SET phone = ? WHERE id = ?").run(phone, accountId);
  await identityDb.prepare(
    "INSERT INTO phone_verifications (id, account_id, phone, code, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), accountId, phone, code, now.toISOString(), expiresAt.toISOString());
  return code;
}

export async function confirmPhoneVerification(accountId, code) {
  const row = await identityDb.prepare(
    "SELECT * FROM phone_verifications WHERE account_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
  ).get(accountId);
  if (!row) return { ok: false, reason: "no_pending_request" };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= PHONE_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

  if (row.code !== code) {
    await identityDb.prepare("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = ?").run(row.id);
    return { ok: false, reason: "wrong_code" };
  }

  await identityDb.prepare("UPDATE phone_verifications SET used = 1 WHERE id = ?").run(row.id);
  await identityDb.prepare("UPDATE accounts SET phone_verified = 1 WHERE id = ?").run(accountId);
  await checkAndAwardBadges(accountId);
  return { ok: true };
}

// ---------------- Verification requests (government ID / business / professional) ----------------
//
// A REAL manual-review workflow, not an instant fake approval — see
// scripts/review-verification.js. Automated instant verification would
// need a KYC vendor (Persona, Stripe Identity, etc.); this is the honest
// version of that feature until one is integrated.
const VERIFICATION_TYPES = new Set(["government_id", "business", "professional"]);
const STATUS_COLUMN = {
  government_id: "government_id_status",
  business: "business_verified_status",
  professional: "professional_verified_status",
};

export async function submitVerificationRequest(accountId, type, submittedData, documentPath = null) {
  if (!VERIFICATION_TYPES.has(type)) throw new Error(`Unknown verification type: ${type}`);
  const existing = await identityDb.prepare(
    "SELECT id FROM verification_requests WHERE account_id = ? AND type = ? AND status = 'pending'"
  ).get(accountId, type);
  if (existing) {
    const err = new Error("You already have a pending request of this type.");
    err.code = "ALREADY_PENDING";
    throw err;
  }
  const id = crypto.randomUUID();
  await identityDb.prepare(
    "INSERT INTO verification_requests (id, account_id, type, submitted_data, document_path, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, accountId, type, submittedData, documentPath, new Date().toISOString());
  await identityDb.prepare(`UPDATE accounts SET ${STATUS_COLUMN[type]} = 'pending' WHERE id = ?`).run(accountId);
  return id;
}

// Attaches an uploaded document to a request already created above —
// mirrors the create-then-attach-media pattern lib/content/service.js
// uses for posts, since the request needs a real id before a file can be
// named after it. documentPath is the PRIVATE object-storage KEY (never
// a public URL, never a signed URL — those expire) — see
// lib/identity/documents.js.
export async function attachVerificationDocument(requestId, documentPath) {
  await identityDb.prepare("UPDATE verification_requests SET document_path = ? WHERE id = ?").run(documentPath, requestId);
}

export async function getVerificationRequestsForAccount(accountId) {
  return identityDb.prepare(
    "SELECT * FROM verification_requests WHERE account_id = ? ORDER BY created_at DESC"
  ).all(accountId);
}

export async function listPendingVerificationRequests() {
  return identityDb.prepare(
    "SELECT * FROM verification_requests WHERE status = 'pending' ORDER BY created_at ASC"
  ).all();
}

// For reviewer oversight — recently-decided requests, so an operator can
// audit past approve/reject calls (their own and others'), not just work
// the pending queue blind.
export async function listRecentlyReviewedVerificationRequests({ limit = 30 } = {}) {
  return identityDb.prepare(
    "SELECT * FROM verification_requests WHERE status != 'pending' ORDER BY reviewed_at DESC LIMIT ?"
  ).all(limit);
}

// Not exposed via any HTTP route — see scripts/review-verification.js.
// Deliberately requires a human reviewedBy identifier, same discipline as
// break-glass, though this is a lower-stakes operation (granting a
// visible badge, not resolving anonymity) so it's single-operator rather
// than two-person.
export async function reviewVerificationRequest(requestId, decision, reviewedBy, note = "") {
  if (!["approved", "rejected"].includes(decision)) throw new Error("decision must be 'approved' or 'rejected'");
  const request = await identityDb.prepare("SELECT * FROM verification_requests WHERE id = ?").get(requestId);
  if (!request) throw new Error("No such verification request.");
  if (request.status !== "pending") throw new Error(`Request is already '${request.status}'.`);

  const now = new Date().toISOString();
  await identityDb.prepare(
    "UPDATE verification_requests SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?"
  ).run(decision, reviewedBy, now, note, requestId);
  await identityDb.prepare(`UPDATE accounts SET ${STATUS_COLUMN[request.type]} = ? WHERE id = ?`).run(
    decision === "approved" ? "verified" : "rejected", request.account_id
  );
  await createNotification(
    request.account_id,
    "verification",
    decision === "approved"
      ? `Your ${request.type.replace("_", " ")} verification was approved.`
      : `Your ${request.type.replace("_", " ")} verification was rejected.${note ? ` (${note})` : ""}`
  );
  return getAccountById(request.account_id);
}

// ---------------- Badges (gamification) ----------------

export async function getAllBadgeDefs() {
  return identityDb.prepare("SELECT * FROM badge_defs").all();
}

export async function getBadges(accountId) {
  return identityDb.prepare(
    `SELECT b.key, b.label, b.description, b.icon, ab.awarded_at
     FROM account_badges ab JOIN badge_defs b ON b.key = ab.badge_key
     WHERE ab.account_id = ? ORDER BY ab.awarded_at DESC`
  ).all(accountId);
}

async function awardBadge(accountId, key) {
  const already = await identityDb.prepare(
    "SELECT 1 FROM account_badges WHERE account_id = ? AND badge_key = ?"
  ).get(accountId, key);
  if (already) return false;
  await identityDb.prepare(
    "INSERT INTO account_badges (account_id, badge_key, awarded_at) VALUES (?, ?, ?)"
  ).run(accountId, key, new Date().toISOString());
  const def = await identityDb.prepare("SELECT label FROM badge_defs WHERE key = ?").get(key);
  await createNotification(accountId, "badge", `New badge: ${def?.label || key}`);
  return true;
}

// Called after actions that could newly qualify an account for a badge.
// `counts` carries whatever the caller already knows (e.g. post count),
// so this doesn't need to query the content store itself — badge logic
// stays in the identity service, counts come from the content service via
// the calling route. See app/api/posts/route.js and others for call sites.
export async function checkAndAwardBadges(accountId, counts = {}) {
  const account = await getAccountById(accountId);
  if (!account) return;

  if (counts.postCount === 1) await awardBadge(accountId, "first_post");
  if (counts.postCount >= 10) await awardBadge(accountId, "prolific_10");
  if (counts.postCount >= 50) await awardBadge(accountId, "prolific_50");
  if (counts.commentCount >= 10) await awardBadge(accountId, "commenter");
  if (counts.repostCount >= 5) await awardBadge(accountId, "reposter");
  if (counts.startedCompany) await awardBadge(accountId, "company_founder");
  if (counts.wonCringeAwards) await awardBadge(accountId, "cringe_champion");

  if (account.emailVerified) await awardBadge(accountId, "verified_email");
  if (account.phoneVerified) await awardBadge(accountId, "verified_phone");
  if (account.isPremium) await awardBadge(accountId, "premium_member");
}

// Convenience wrapper for the one case where badge-checking needs to
// happen for whoever owns a given anonymous_id (e.g. the Cringe Awards
// #1 spot) rather than the currently-authenticated account. Uses the same
// internal routing lookup as notifyOwnerOfAnonymousId — see that
// function's comment for why this is architecturally fine (self-service-
// adjacent internal routing, not identity exposure).
export async function checkAndAwardBadgesForAnonymousId(anonymousId, counts = {}) {
  const ownerAccountId = await getAccountIdForRouting(anonymousId);
  if (!ownerAccountId) return;
  await checkAndAwardBadges(ownerAccountId, counts);
}
