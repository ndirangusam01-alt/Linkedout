import { bypassesGates } from "./admin/roles.js";
// Basic/Plus/Pro capability rules for Vent Rooms — kept separate from
// lib/identity/rate-limit.js's TIERED_DAILY_LIMITS since this is a plain
// yes/no capability check, not a rolling-window counter.
//   basic: can't join or start a room at all
//   plus:  can join a room, can't start one
//   pro:   can join and start
export const VENT_ACCESS = {
  basic: { canJoin: false, canCreate: false },
  plus: { canJoin: true, canCreate: false },
  pro: { canJoin: true, canCreate: true },
};

export function canJoinVent(tier) {
  return VENT_ACCESS[tier]?.canJoin ?? false;
}

export function canCreateVent(tier) {
  return VENT_ACCESS[tier]?.canCreate ?? false;
}

// Requirements to buy Plus or Pro: a verified email AND a verified phone
// (both done in Settings). Enforced server-side in both the real Stripe
// checkout route — not just shown in the UI — so it can't be bypassed by
// calling the API directly.
export function missingUpgradeRequirements(account) {
  const missing = [];
  if (bypassesGates(account?.role)) return missing; // staff testing the prototype
  if (!account?.emailVerified) missing.push("email");
  if (!account?.phoneVerified) missing.push("phone");
  return missing;
}

export function requirementsMessage(missing) {
  const label = missing.map((m) => (m === "email" ? "email address" : "phone number")).join(" and ");
  return `Verify your ${label} in Settings before upgrading.`;
}

// Staff with gate-bypass act as Pro everywhere a plan is checked (Vent access,
// page allowances, daily AI caps) so every feature can be exercised in testing.
export function effectiveTier(account) {
  return bypassesGates(account?.role) ? "pro" : account?.premiumTier || "basic";
}
