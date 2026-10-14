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


// ---------------------------------------------------------------------------
// Messaging perks per plan. ONE source of truth: the server enforces these and
// the plan table reads from them, so what is promised is what is delivered.
//   OUT      normal messaging; can request people already in their network
//   OUT+     more requests/day; can message people outside their network
//   OUT PRO  priority requests, higher limits, analytics, AI-assisted outreach
// "Network" = you follow them or they follow you, or you already have a chat.
// ---------------------------------------------------------------------------
export const MESSAGING = {
  basic: { requestsPerDay: 5,  outsideNetwork: false, priority: false, messagesPerDay: 200,  maxLen: 4000, requestMaxLen: 300, analytics: false, aiOutreach: false },
  plus:  { requestsPerDay: 20, outsideNetwork: true,  priority: false, messagesPerDay: 200,  maxLen: 4000, requestMaxLen: 300, analytics: false, aiOutreach: false },
  pro:   { requestsPerDay: 60, outsideNetwork: true,  priority: true,  messagesPerDay: 1000, maxLen: 8000, requestMaxLen: 600, analytics: true,  aiOutreach: true },
};
export const messagingFor = (tier) => MESSAGING[tier] || MESSAGING.basic;


// ---------------------------------------------------------------------------
// Plans: names, prices and the capability table. ONE source of truth. The
// server enforces these (routes call `can*`/`*For` below) and the plan page and
// native app read the same numbers, so what is promised is what is delivered.
//   OUT       Speak        generously free — network growth and storytelling
//   OUT+      Understand   depth and convenience, never the right to speak
//   OUT PRO   Investigate  analysis, research, creator and community tools
// Principle: reading Stories, creating Stories and seeing company patterns are
// free on every plan. Paid plans buy synthesis, analytics and convenience.
// ---------------------------------------------------------------------------
export const PLANS = {
  basic: { name: "OUT",     tagline: "Speak",       monthly: 0,     annual: 0,       annualMonthly: 0 },
  plus:  { name: "OUT+",    tagline: "Understand",  monthly: 14.99, annual: 158.29,  annualMonthly: 13.19 },
  pro:   { name: "OUT PRO", tagline: "Investigate", monthly: 34.99, annual: 369.49,  annualMonthly: 30.79 },
};
export const BUSINESS_PLANS = {
  business:     { name: "Business",     monthly: 199,  annual: 2101.44, annualMonthly: 175.12 },
  business_pro: { name: "Business Pro", monthly: 499,  annual: 5269.44, annualMonthly: 439.12 },
  enterprise:   { name: "Enterprise",   monthly: null, annual: null,    annualMonthly: null, custom: true },
};

// Server-enforced capability flags and limits per tier.
export const STORY_PERKS = {
  basic: { aliases: 3,  trackedStories: 5, savedSearches: 0, circlesCreate: 0, circleMembersMax: 0, exports: false,        aiStoryAssistant: false, identityRisk: false, summaries: false, companyIntel: false, deepDive: false, patternExplorer: false, scheduledPublishing: false, creatorAnalytics: false, hostRooms: false },
  plus:  { aliases: 10, trackedStories: Infinity, savedSearches: 5, circlesCreate: 1, circleMembersMax: 500, exports: false, aiStoryAssistant: true,  identityRisk: true,  summaries: true,  companyIntel: true,  deepDive: false, patternExplorer: false, scheduledPublishing: true,  creatorAnalytics: false, hostRooms: false },
  pro:   { aliases: 30, trackedStories: Infinity, savedSearches: 25, circlesCreate: 5, circleMembersMax: 5000, exports: true, aiStoryAssistant: true,  identityRisk: true,  summaries: true,  companyIntel: true,  deepDive: true,  patternExplorer: true,  scheduledPublishing: true,  creatorAnalytics: true,  hostRooms: true },
};
export const perksFor = (tier) => STORY_PERKS[tier] || STORY_PERKS.basic;
export const planName = (tier) => (PLANS[tier] || PLANS.basic).name;

// Business plans (companies, not individuals). Principle that never changes: a business
// plan buys INSIGHT and RESPONSE tools. It never buys removal, hiding, editing, ranking or
// the identity of authors. Right of reply itself is free for every verified company.
export const BUSINESS_PERKS = {
  none:         { insights: false, benchmark: false, alerts: false, reps: 1, exports: false, priorityReview: false },
  business:     { insights: true,  benchmark: false, alerts: true,  reps: 3,  exports: false, priorityReview: false },
  business_pro: { insights: true,  benchmark: true,  alerts: true,  reps: 10, exports: true,  priorityReview: true },
  enterprise:   { insights: true,  benchmark: true,  alerts: true,  reps: 50, exports: true,  priorityReview: true },
};
export const businessPerks = (plan) => BUSINESS_PERKS[plan] || BUSINESS_PERKS.none;
