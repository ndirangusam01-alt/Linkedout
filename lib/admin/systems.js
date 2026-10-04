// The larger admin "systems" — Advertising, Customer Support, Billing, Feed
// controls & Announcements, DM Investigations — plus sidebar badges and global
// search. Registered into the generic section engine by lib/admin/service.js
// (LIST = what to show, ACT = row actions, CREATE = add form, DETAIL = full page).
import { identityDb } from "@/lib/identity/db";
import { contentDb } from "@/lib/content/db";
import { createNotification, setPremiumTier } from "@/lib/identity/service";
import { decryptMessage } from "@/lib/messaging/crypto";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { can } from "./roles";
import { logStaff } from "./enforce";

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const uid = () => crypto.randomUUID();
const safe = async (fn, fb = 0) => { try { return await fn(); } catch { return fb; } };
const num = async (db, sql, ...p) => Number((await db.prepare(sql).get(...p))?.n ?? 0);
const cut = (s, k = 90) => (s && s.length > k ? s.slice(0, k) + "…" : s || "");
const ts = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "");
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const kv = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)]);
const col = (key, label) => ({ key, label });
const tbl = (columns, rows, extra = {}) => ({ columns, rows, actions: [], summary: [], ...extra });
const REASON = { key: "reason", label: "Reason / note" };
const money = (c) => "$" + (Number(c || 0) / 100).toFixed(2);
const hours = (ms) => (ms == null ? "—" : ms < 36e5 ? Math.round(ms / 60000) + "m" : (ms / 36e5).toFixed(1) + "h");
const PRICE = { plus: 4.99, pro: 9.99 };

// =================================================================== ADVERTISING
const POLICIES = ["Misleading or deceptive claims", "Prohibited product or service", "Adult or sensitive content", "Hateful or discriminatory content", "Landing page problem", "Low quality or spam", "Other policy violation"];
const AD_RISK = /(guaranteed|miracle|get rich|risk[- ]free|100% (safe|free)|crypto|casino|betting|weight loss|cure)/i;

async function advertiserOptions() {
  const r = await contentDb.prepare("SELECT id, name FROM advertisers ORDER BY name").all();
  return [["", "— none —"], ...r.map((a) => [a.id, a.name])];
}
const adFormFields = (advOpts) => [
  { key: "advertiser_id", label: "Advertiser", options: advOpts },
  { key: "brand", label: "Brand name" }, { key: "tagline", label: "Ad copy", long: true }, { key: "url", label: "Destination URL (https://…)" },
  { key: "starts_at", label: "Start date (YYYY-MM-DD)", optional: true }, { key: "ends_at", label: "End date (YYYY-MM-DD)", optional: true },
  { key: "total_budget", label: "Total budget in USD (blank = unlimited)", optional: true }, { key: "cpm", label: "Price per 1,000 impressions in USD", optional: true },
];
const validUrl = (u) => { try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };

async function adStatsMap() {
  const r = await contentDb.prepare("SELECT ad_id, kind, COUNT(*) c FROM ad_events GROUP BY ad_id, kind").all();
  const m = new Map();
  for (const x of r) { const o = m.get(x.ad_id) || { imp: 0, clk: 0 }; if (x.kind === "impression") o.imp = +x.c; else o.clk = +x.c; m.set(x.ad_id, o); }
  return m;
}
const spendOf = (imp, cpm) => Math.round(imp * (cpm ?? 500) / 1000);
function adState(a, imp) {
  if (a.review_status !== "approved") return a.review_status;
  const now = iso();
  if (a.starts_at && a.starts_at > now) return "scheduled";
  if (a.ends_at && a.ends_at < now) return "ended";
  if (a.total_budget_cents != null && spendOf(imp, a.cpm_cents) >= a.total_budget_cents) return "budget reached";
  return "live";
}

// =================================================================== SUPPORT
const SLA_H = { urgent: 4, high: 12, normal: 24, low: 72 };
const TICKET_STATUS = ["open", "pending", "resolved", "closed"];
const slaText = (t) => {
  if (["resolved", "closed"].includes(t.status)) return "—";
  const due = new Date(t.created_at).getTime() + (SLA_H[t.priority] || 24) * 36e5;
  if (t.first_response_at) return "responded";
  const d = due - Date.now();
  return d < 0 ? `overdue ${hours(-d)}` : `due in ${hours(d)}`;
};

// =================================================================== DM INVESTIGATIONS
const needCase = (q) => {
  if (!q.caseRef || q.caseRef.trim().length < 3) throw bad("Enter a case or ticket reference.");
  if (!q.reason || q.reason.trim().length < 15) throw bad("Explain why you need access (at least 15 characters). This is recorded.");
};
async function labelsFor(keys) {
  const r = keys.length ? await identityDb.prepare("SELECT i.anonymous_id k, i.display_label l, a.pseudonym p FROM anonymous_identities i LEFT JOIN accounts a ON a.id = i.account_id WHERE i.anonymous_id = ANY(?)").all(keys) : [];
  return new Map(r.map((x) => [x.k, x.p || x.l || x.k.slice(0, 8)]));
}
const dmText = (m) => (m.deleted_at ? "[deleted by sender]" : (() => { try { return decryptMessage(m.conversation_id, m.sender_key, m.body_enc); } catch { return "[unreadable]"; } })());

// =================================================================== exported registries
export const LIST = {
  // ---------------- Ads: campaigns & creatives
  async ads() {
    const [rows, stats, advOpts] = await Promise.all([contentDb.prepare("SELECT * FROM ads ORDER BY id DESC").all(), adStatsMap(), advertiserOptions()]);
    const advName = new Map(advOpts.map(([id, n]) => [id, n]));
    const data = rows.map((a) => {
      const d = JSON.parse(a.data), s = stats.get(a.id) || { imp: 0, clk: 0 }, spent = spendOf(s.imp, a.cpm_cents);
      return {
        id: String(a.id), name: d.brand || a.name || `Ad ${a.id}`, copy: cut(d.tagline || d.text || "", 70), advertiser: advName.get(a.advertiser_id) || "—",
        status: adState(a, s.imp), schedule: a.starts_at || a.ends_at ? `${a.starts_at?.slice(0, 10) || "…"} → ${a.ends_at?.slice(0, 10) || "…"}` : "always on",
        budget: a.total_budget_cents != null ? `${money(spent)} / ${money(a.total_budget_cents)}` : `${money(spent)} spent`, impressions: s.imp, clicks: s.clk, ctr: s.imp ? ((s.clk / s.imp) * 100).toFixed(2) + "%" : "—",
        _form: { advertiser_id: a.advertiser_id || "", brand: d.brand || "", tagline: d.tagline || "", url: d.url || "", starts_at: a.starts_at?.slice(0, 10) || "", ends_at: a.ends_at?.slice(0, 10) || "", total_budget: a.total_budget_cents != null ? (a.total_budget_cents / 100).toString() : "", cpm: ((a.cpm_cents ?? 500) / 100).toString() },
      };
    });
    const live = data.filter((x) => x.status === "live").length, imp = data.reduce((s, x) => s + x.impressions, 0), clk = data.reduce((s, x) => s + x.clicks, 0);
    return tbl([col("name", "Ad"), col("advertiser", "Advertiser"), col("copy", "Copy"), col("status", "State"), col("schedule", "Schedule"), col("budget", "Budget"), col("impressions", "Impr."), col("clicks", "Clicks"), col("ctr", "CTR")], data, {
      summary: [["Campaigns", data.length], ["Live now", live], ["Impressions", imp], ["Clicks", clk], ["CTR", imp ? ((clk / imp) * 100).toFixed(2) + "%" : "—"]],
      chips: "status", create: adFormFields(advOpts), createLabel: "+ New ad",
      actions: [
        { id: "edit", label: "Edit", form: adFormFields(advOpts) },
        { id: "pause", label: "Pause", when: { status: ["live", "scheduled", "budget reached"] } },
        { id: "resume", label: "Resume", when: { status: ["paused", "rejected", "pending"] } },
        { id: "delete", label: "Delete", danger: true, input: { key: "reason", label: "Type a reason to delete this ad" } },
      ],
    });
  },
  async adreview() {
    const [rows, advOpts] = await Promise.all([contentDb.prepare("SELECT * FROM ads WHERE review_status IN ('pending','rejected') OR (created_at IS NOT NULL AND created_at >= ?) ORDER BY (review_status = 'pending') DESC, id DESC LIMIT 100").all(iso(14 * 864e5)), advertiserOptions()]);
    const adv = new Map(advOpts.map(([id, n]) => [id, n]));
    return tbl([col("name", "Ad"), col("advertiser", "Advertiser"), col("copy", "Creative"), col("url", "Destination"), col("flags", "Automated checks"), col("status", "Status"), col("reason", "Rejection reason")],
      rows.map((a) => { const d = JSON.parse(a.data), text = `${d.brand || ""} ${d.tagline || ""}`; const flags = [AD_RISK.test(text) && "risky claim wording", !validUrl(d.url) && "no valid landing page"].filter(Boolean);
        return { id: String(a.id), name: d.brand || `Ad ${a.id}`, advertiser: adv.get(a.advertiser_id) || "—", copy: cut(d.tagline, 120), url: d.url || "—", flags: flags.join(", ") || "none", status: a.review_status, reason: a.reject_reason || "" }; }),
      { summary: [["Awaiting review", rows.filter((a) => a.review_status === "pending").length]], chips: "status",
        actions: [{ id: "approve", label: "Approve", when: { status: ["pending", "rejected"] } }, { id: "reject", label: "Reject", danger: true, when: { status: ["pending", "approved"] }, input: { key: "reason", label: "Policy reason", options: POLICIES } }] });
  },
  async advertisers() {
    const [rows, stats, ads] = await Promise.all([contentDb.prepare("SELECT * FROM advertisers ORDER BY created_at DESC").all(), adStatsMap(), contentDb.prepare("SELECT id, advertiser_id, cpm_cents FROM ads").all()]);
    const by = new Map();
    for (const a of ads) { if (!a.advertiser_id) continue; const o = by.get(a.advertiser_id) || { n: 0, imp: 0, spend: 0 }; const s = stats.get(a.id) || { imp: 0 }; o.n++; o.imp += s.imp; o.spend += spendOf(s.imp, a.cpm_cents); by.set(a.advertiser_id, o); }
    const f = [{ key: "name", label: "Company name" }, { key: "contact_email", label: "Billing / contact email", optional: true }, { key: "notes", label: "Internal notes", long: true, optional: true }];
    return tbl([col("name", "Advertiser"), col("contact", "Contact"), col("status", "Status"), col("campaigns", "Campaigns"), col("impressions", "Impressions"), col("spend", "Est. spend"), col("since", "Added")],
      rows.map((a) => { const o = by.get(a.id) || { n: 0, imp: 0, spend: 0 }; return { id: a.id, name: a.name, contact: a.contact_email || "—", status: a.status, campaigns: o.n, impressions: o.imp, spend: money(o.spend), since: a.created_at.slice(0, 10), _form: { name: a.name, contact_email: a.contact_email || "", notes: a.notes || "" } }; }),
      { summary: [["Advertisers", rows.length], ["Active", rows.filter((a) => a.status === "active").length]], create: f, createLabel: "+ New advertiser", chips: "status",
        actions: [{ id: "edit", label: "Edit", form: f }, { id: "suspend", label: "Suspend (stops all their ads)", danger: true, when: { status: ["active"] }, input: REASON }, { id: "activate", label: "Reactivate", when: { status: ["suspended"] } }] });
  },
  async adreports() {
    const rows = await contentDb.prepare("SELECT substr(created_at,1,10) d, kind, COUNT(*) c FROM ad_events WHERE created_at >= ? GROUP BY d, kind").all(iso(30 * 864e5));
    const days = Array.from({ length: 14 }, (_, i) => iso(i * 864e5).slice(0, 10)), m = new Map();
    for (const r of rows) { const o = m.get(r.d) || { imp: 0, clk: 0 }; if (r.kind === "impression") o.imp = +r.c; else o.clk = +r.c; m.set(r.d, o); }
    const avgCpm = Number((await safe(() => contentDb.prepare("SELECT AVG(COALESCE(cpm_cents,500)) a FROM ads WHERE review_status = 'approved'").get(), { a: 500 })).a || 500);
    const tot = rows.reduce((s, r) => ({ imp: s.imp + (r.kind === "impression" ? +r.c : 0), clk: s.clk + (r.kind === "click" ? +r.c : 0) }), { imp: 0, clk: 0 });
    return tbl([col("day", "Day"), col("impressions", "Impressions"), col("clicks", "Clicks"), col("ctr", "CTR"), col("spend", "Est. revenue")],
      days.map((d) => { const o = m.get(d) || { imp: 0, clk: 0 }; return { id: d, day: d, impressions: o.imp, clicks: o.clk, ctr: o.imp ? ((o.clk / o.imp) * 100).toFixed(2) + "%" : "—", spend: money(spendOf(o.imp, avgCpm)) }; }),
      { summary: [["Impressions (30d)", tot.imp], ["Clicks (30d)", tot.clk], ["CTR (30d)", tot.imp ? ((tot.clk / tot.imp) * 100).toFixed(2) + "%" : "—"], ["Est. revenue (30d)", money(spendOf(tot.imp, avgCpm))]] });
  },

  // ---------------- Support
  async support() {
    const r = await identityDb.prepare("SELECT t.*, a.pseudonym, s.pseudonym AS assignee FROM support_tickets t LEFT JOIN accounts a ON a.id = t.account_id LEFT JOIN accounts s ON s.id = t.assignee_id ORDER BY (t.status IN ('open','pending')) DESC, t.created_at DESC LIMIT 300").all();
    const open = r.filter((t) => ["open", "pending"].includes(t.status)), over = open.filter((t) => !t.first_response_at && Date.now() > new Date(t.created_at).getTime() + (SLA_H[t.priority] || 24) * 36e5);
    const resp = r.filter((t) => t.first_response_at).map((t) => new Date(t.first_response_at) - new Date(t.created_at)), resv = r.filter((t) => t.resolved_at).map((t) => new Date(t.resolved_at) - new Date(t.created_at));
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    return tbl([col("ref", "Ticket"), col("subject", "Subject"), col("user", "From"), col("category", "Category"), col("priority", "Priority"), col("status", "Status"), col("assignee", "Assigned"), col("age", "Opened"), col("sla", "SLA")],
      r.map((t) => ({ id: t.id, ref: "T-" + t.id.slice(0, 6).toUpperCase(), subject: cut(t.subject, 60), user: t.pseudonym || "—", category: t.category, priority: t.priority, status: t.status, assignee: t.assignee || "unassigned", age: ts(t.created_at), sla: slaText(t) })),
      { detail: true, chips: "status", summary: [["Open", open.length], ["Unassigned", open.filter((t) => !t.assignee_id).length], ["Overdue (SLA)", over.length], ["Avg first response", hours(avg(resp))], ["Avg resolution", hours(avg(resv))], ["Resolved (7d)", r.filter((t) => t.resolved_at && t.resolved_at >= iso(7 * 864e5)).length]],
        actions: [{ id: "take", label: "Take", when: { assignee: ["unassigned"] } }, { id: "resolve", label: "Resolve", when: { status: ["open", "pending"] }, input: { key: "body", label: "Closing message to the user (optional)", optional: true } }] });
  },
  async supportmacros() {
    const r = await identityDb.prepare("SELECT * FROM support_macros ORDER BY title").all();
    const f = [{ key: "title", label: "Title" }, { key: "body", label: "Reply text", long: true }];
    return tbl([col("title", "Title"), col("body", "Text")], r.map((m) => ({ id: m.id, title: m.title, body: cut(m.body, 140), _form: { title: m.title, body: m.body } })),
      { create: f, createLabel: "+ New response", actions: [{ id: "edit", label: "Edit", form: f }, { id: "delete", label: "Delete", danger: true }] });
  },

  // ---------------- Billing
  async payments() {
    const r = await identityDb.prepare("SELECT id, pseudonym, premium_tier, subscription_status, stripe_customer_id, stripe_subscription_id, created_at FROM accounts WHERE premium_tier <> 'basic' OR stripe_customer_id IS NOT NULL ORDER BY created_at DESC LIMIT 400").all();
    const paid = r.filter((x) => PRICE[x.premium_tier]), mrr = paid.reduce((s, x) => s + PRICE[x.premium_tier], 0);
    const [added, canceled, failed] = await Promise.all([
      safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM billing_events WHERE created_at >= ? AND (event LIKE 'upgrade_%' OR event = 'stripe_subscription_active')", iso(30 * 864e5))),
      safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM billing_events WHERE created_at >= ? AND (event = 'downgrade' OR event = 'stripe_subscription_canceled')", iso(30 * 864e5))),
      safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM billing_events WHERE created_at >= ? AND (event LIKE '%past_due%' OR event LIKE '%unpaid%' OR event LIKE '%incomplete%')", iso(30 * 864e5))),
    ]);
    const stripe = isStripeConfigured();
    return tbl([col("user", "Account"), col("plan", "Plan"), col("status", "Status"), col("price", "Price/mo"), col("stripe", "Stripe"), col("since", "Member since")],
      r.map((x) => ({ id: x.id, user: x.pseudonym, plan: x.premium_tier, status: x.subscription_status || (PRICE[x.premium_tier] ? "manual" : "free"), price: PRICE[x.premium_tier] ? "$" + PRICE[x.premium_tier].toFixed(2) : "—", stripe: x.stripe_subscription_id ? "subscribed" : x.stripe_customer_id ? "customer" : "—", since: x.created_at.slice(0, 10) })),
      { chips: "plan", summary: [["MRR (est.)", "$" + mrr.toFixed(2)], ["ARR (est.)", "$" + (mrr * 12).toFixed(0)], ["Paying accounts", paid.length], ["ARPU", paid.length ? "$" + (mrr / paid.length).toFixed(2) : "—"], ["New (30d)", added], ["Cancelled (30d)", canceled], ["Churn (30d)", paid.length + canceled ? Math.round((canceled / (paid.length + canceled)) * 100) + "%" : "—"], ["Payment problems (30d)", failed], ["Stripe", stripe ? "connected" : "not configured"]],
        actions: [
          { id: "set_plan", label: "Set plan", input: { key: "plan", label: "Plan (a note is recorded in the audit log)", options: ["basic", "plus", "pro"] } },
          { id: "stripe_open", label: "Open in Stripe", when: { stripe: ["subscribed", "customer"] } },
          { id: "cancel_sub", label: "Cancel at period end", danger: true, when: { stripe: ["subscribed"] }, input: REASON },
          { id: "refund", label: "Refund latest payment", danger: true, when: { stripe: ["subscribed", "customer"] }, input: REASON },
        ] });
  },
  async billing() {
    const r = await identityDb.prepare("SELECT b.*, a.pseudonym FROM billing_events b LEFT JOIN accounts a ON a.id = b.account_id ORDER BY b.created_at DESC LIMIT 400").all();
    return tbl([col("when", "When"), col("user", "Account"), col("event", "Event")], r.map((x) => ({ id: x.id, when: ts(x.created_at), user: x.pseudonym || "(deleted)", event: x.event })), { chips: "event", summary: [["Events shown", r.length]] });
  },
  async revenue() {
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
    const ev = await identityDb.prepare("SELECT substr(created_at,1,7) m, event, COUNT(*) c FROM billing_events WHERE created_at >= ? GROUP BY m, event").all(iso(370 * 864e5));
    const m = new Map(months.map((k) => [k, { add: 0, cancel: 0 }]));
    for (const e of ev) { const o = m.get(e.m); if (!o) continue; if (e.event.startsWith("upgrade_") || e.event === "stripe_subscription_active") o.add += +e.c; if (e.event === "downgrade" || e.event === "stripe_subscription_canceled") o.cancel += +e.c; }
    const tiers = await identityDb.prepare("SELECT premium_tier t, COUNT(*) c FROM accounts GROUP BY premium_tier").all();
    return tbl([col("month", "Month"), col("added", "New subscriptions"), col("cancelled", "Cancellations"), col("net", "Net")],
      months.map((k) => { const o = m.get(k); return { id: k, month: k, added: o.add, cancelled: o.cancel, net: (o.add - o.cancel >= 0 ? "+" : "") + (o.add - o.cancel) }; }),
      { summary: [["Plus", "$" + PRICE.plus.toFixed(2) + "/mo"], ["Pro", "$" + PRICE.pro.toFixed(2) + "/mo"], ...tiers.map((t) => [`${t.t} accounts`, +t.c])] });
  },
  async promos() {
    if (!isStripeConfigured()) return tbl([col("code", "Code")], [], { summary: [["Stripe", "not configured — add STRIPE_SECRET_KEY"]] });
    const stripe = getStripe();
    const list = await stripe.promotionCodes.list({ limit: 50, expand: ["data.coupon"] });
    const f = [{ key: "code", label: "Code customers type (e.g. LAUNCH20)" }, { key: "percent_off", label: "Percent off (1–100)" }, { key: "duration", label: "Duration", options: ["once", "repeating", "forever"] }, { key: "months", label: "Months (only if repeating)", optional: true }, { key: "max_redemptions", label: "Max redemptions (blank = unlimited)", optional: true }];
    return tbl([col("code", "Code"), col("off", "Discount"), col("duration", "Duration"), col("used", "Redeemed"), col("status", "Status")],
      list.data.map((p) => ({ id: p.id, code: p.code, off: p.coupon.percent_off ? `${p.coupon.percent_off}% off` : `${money(p.coupon.amount_off)} off`, duration: p.coupon.duration + (p.coupon.duration_in_months ? ` (${p.coupon.duration_in_months} mo)` : ""), used: `${p.times_redeemed}${p.max_redemptions ? " / " + p.max_redemptions : ""}`, status: p.active ? "active" : "inactive" })),
      { create: f, createLabel: "+ New promo code", chips: "status", actions: [{ id: "deactivate", label: "Deactivate", danger: true, when: { status: ["active"] } }] });
  },

  // ---------------- Feed controls & announcements
  async feedcontrols() {
    const s = await settings();
    return tbl([col("setting", "Setting"), col("value", "Current value"), col("what", "What it does")], [
      { id: "ads_enabled", setting: "Ads in the feed", value: s.ads_enabled === "0" ? "off" : "on", what: "Master switch. Off hides every ad for everyone." },
      { id: "ad_every", setting: "Ad frequency", value: `every ${s.ad_every} posts`, what: "How many posts between ads (Basic accounts only)." },
    ], { actions: [{ id: "set", label: "Turn on / off", when: { id: ["ads_enabled"] }, input: { key: "value", label: "Ads in the feed", options: ["on", "off"] } }, { id: "set", label: "Change frequency", when: { id: ["ad_every"] }, input: { key: "value", label: "Posts between ads (2–50)" } }], summary: [["Applies to", "web + native feeds"]] });
  },
  async announcements() {
    const r = await contentDb.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100").all();
    const f = [{ key: "title", label: "Headline" }, { key: "body", label: "Message", long: true, optional: true }, { key: "severity", label: "Style", options: ["info", "promo", "warning", "critical"] }, { key: "audience", label: "Show to", options: ["all", "free", "premium"] }, { key: "starts_at", label: "Start date (YYYY-MM-DD)", optional: true }, { key: "ends_at", label: "End date (YYYY-MM-DD)", optional: true }];
    const state = (a) => (!a.active ? "off" : a.starts_at && a.starts_at > iso() ? "scheduled" : a.ends_at && a.ends_at < iso() ? "ended" : "live");
    return tbl([col("title", "Headline"), col("severity", "Style"), col("audience", "Audience"), col("window", "Window"), col("status", "State")],
      r.map((a) => ({ id: a.id, title: a.title, severity: a.severity, audience: a.audience, window: a.starts_at || a.ends_at ? `${a.starts_at?.slice(0, 10) || "…"} → ${a.ends_at?.slice(0, 10) || "…"}` : "always", status: state(a), _form: { title: a.title, body: a.body || "", severity: a.severity, audience: a.audience, starts_at: a.starts_at?.slice(0, 10) || "", ends_at: a.ends_at?.slice(0, 10) || "" } })),
      { chips: "status", create: f, createLabel: "+ New announcement", summary: [["Live", r.filter((a) => state(a) === "live").length]],
        actions: [{ id: "edit", label: "Edit", form: f }, { id: "turn_off", label: "Turn off", when: { status: ["live", "scheduled"] } }, { id: "turn_on", label: "Turn on", when: { status: ["off"] } }, { id: "delete", label: "Delete", danger: true }] });
  },

  // ---------------- DM investigations (super admin only; every use is recorded)
  async dminvestigations(staff, q = {}) {
    if (!q.caseRef && !q.reason) return { kind: "dm", needsCase: true, results: null };
    needCase(q);
    const keys = new Set();
    if (q.participant) {
      const p = q.participant.trim();
      const accts = await identityDb.prepare("SELECT id FROM accounts WHERE pseudonym ILIKE ? OR id = ? LIMIT 20").all(p, p);
      const ids = accts.map((a) => a.id);
      const idn = ids.length ? await identityDb.prepare("SELECT anonymous_id FROM anonymous_identities WHERE account_id = ANY(?)").all(ids) : [];
      idn.forEach((i) => keys.add(i.anonymous_id));
      if (!keys.size) return { kind: "dm", results: [], note: "No account matches that participant." };
    }
    const where = [], params = [];
    if (keys.size) { where.push("(c.a_key = ANY(?) OR c.b_key = ANY(?))"); params.push([...keys], [...keys]); }
    if (q.conversationId) { where.push("c.id = ?"); params.push(q.conversationId.trim()); }
    if (q.from) { where.push("COALESCE(c.last_message_at, c.created_at) >= ?"); params.push(q.from); }
    if (q.to) { where.push("COALESCE(c.last_message_at, c.created_at) <= ?"); params.push(q.to + "T23:59:59.999Z"); }
    if (q.status) { where.push("c.status = ?"); params.push(q.status); }
    if (q.reportedOnly === "1") where.push("EXISTS (SELECT 1 FROM dm_reports r WHERE r.conversation_id = c.id)");
    const rows = await contentDb.prepare(`SELECT c.*, (SELECT COUNT(*) FROM dm_messages m WHERE m.conversation_id = c.id) AS msgs, (SELECT COUNT(*) FROM dm_reports r WHERE r.conversation_id = c.id) AS reps FROM dm_conversations c ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY COALESCE(c.last_message_at, c.created_at) DESC LIMIT 100`).all(...params);
    let out = rows;
    if (q.keyword?.trim()) {
      const kw = q.keyword.trim().toLowerCase(), hit = new Set();
      for (const c of rows) {
        const ms = await contentDb.prepare("SELECT conversation_id, sender_key, body_enc, deleted_at FROM dm_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 400").all(c.id);
        if (ms.some((m) => dmText(m).toLowerCase().includes(kw))) hit.add(c.id);
      }
      out = rows.filter((c) => hit.has(c.id));
    }
    const labels = await labelsFor([...new Set(out.flatMap((c) => [c.a_key, c.b_key]))]);
    await logStaff(staff, "dm_search", null, JSON.stringify({ caseRef: q.caseRef, reason: q.reason, filters: { participant: q.participant || null, conversationId: q.conversationId || null, from: q.from || null, to: q.to || null, status: q.status || null, reportedOnly: q.reportedOnly === "1", keyword: !!q.keyword }, results: out.length }));
    return { kind: "dm", results: out.map((c) => ({ id: c.id, a: labels.get(c.a_key) || "?", b: labels.get(c.b_key) || "?", status: c.status, messages: +c.msgs, reports: +c.reps, last: ts(c.last_message_at || c.created_at), started: ts(c.created_at) })) };
  },
};

async function settings() {
  const r = await contentDb.prepare("SELECT key, value FROM feed_settings").all();
  return { ads_enabled: "1", ad_every: "5", ...Object.fromEntries(r.map((x) => [x.key, x.value])) };
}
export const getFeedSettings = settings;

export const DETAIL = {
  async support(staff, id) {
    const t = await identityDb.prepare("SELECT t.*, a.pseudonym, a.email, a.premium_tier, a.created_at AS acct_created, s.pseudonym AS assignee FROM support_tickets t LEFT JOIN accounts a ON a.id = t.account_id LEFT JOIN accounts s ON s.id = t.assignee_id WHERE t.id = ?").get(id);
    if (!t) throw bad("No such ticket.", 404);
    const msgs = await identityDb.prepare("SELECT m.*, a.pseudonym FROM support_messages m LEFT JOIN accounts a ON a.id = m.author_id WHERE m.ticket_id = ? ORDER BY m.created_at ASC").all(id);
    const prior = t.account_id ? await safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM support_tickets WHERE account_id = ? AND id <> ?", t.account_id, id)) : 0;
    const macros = await identityDb.prepare("SELECT id, title, body FROM support_macros ORDER BY title").all();
    const pii = can(staff.role, "users.pii");
    const thread = [{ who: t.pseudonym || "User", kind: "user", body: t.body, at: ts(t.created_at) }, ...msgs.map((m) => ({ who: m.kind === "user" ? t.pseudonym || "User" : m.pseudonym || "Staff", kind: m.kind, body: m.body, at: ts(m.created_at) }))];
    const open = ["open", "pending"].includes(t.status);
    return { title: `${t.subject}`, status: t.status, open, thread, macros, compose: true,
      blocks: [
        { title: "Ticket", rows: kv({ Reference: "T-" + t.id.slice(0, 6).toUpperCase(), Category: t.category, Priority: t.priority, Assigned: t.assignee || "unassigned", Opened: ts(t.created_at), "First response": t.first_response_at ? hours(new Date(t.first_response_at) - new Date(t.created_at)) : "not yet", Resolved: ts(t.resolved_at), SLA: slaText(t) }) },
        { title: "Requester", rows: kv({ Handle: t.pseudonym, ...(pii ? { Email: t.email } : {}), Plan: t.premium_tier, "Member since": ts(t.acct_created), "Other tickets": prior }) },
      ] };
  },
  async dminvestigations(staff, id, q = {}) {
    needCase(q);
    const c = await contentDb.prepare("SELECT * FROM dm_conversations WHERE id = ?").get(id);
    if (!c) throw bad("No such conversation.", 404);
    const ms = await contentDb.prepare("SELECT * FROM dm_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 600").all(id);
    const labels = await labelsFor([c.a_key, c.b_key]);
    const reports = await contentDb.prepare("SELECT reason, details, status, created_at FROM dm_reports WHERE conversation_id = ? ORDER BY created_at DESC").all(id);
    await logStaff(staff, "dm_view_conversation", id, JSON.stringify({ caseRef: q.caseRef, reason: q.reason, messages: ms.length }));
    return { noActions: true, title: `${labels.get(c.a_key) || "?"} ↔ ${labels.get(c.b_key) || "?"}`, status: c.status, open: false,
      thread: ms.map((m) => ({ who: labels.get(m.sender_key) || "?", kind: m.sender_key === c.a_key ? "a" : "b", body: dmText(m), at: ts(m.created_at) })),
      blocks: [{ title: "Conversation", rows: kv({ Started: ts(c.created_at), Status: c.status, Accepted: ts(c.accepted_at), "Messages shown": ms.length, "Disappearing timer": c.ttl_seconds ? c.ttl_seconds + "s" : "off" }) },
        { title: "Reports on this conversation", rows: reports.length ? reports.map((r) => [`${ts(r.created_at)} · ${r.reason} (${r.status})`, cut(r.details, 120)]) : [["None", ""]] },
        { title: "Access record", rows: kv({ "Case reference": q.caseRef, "Your stated reason": q.reason, Note: "This view was recorded in the audit log." }) }] };
  },
};

export const ACT = {
  async ads(staff, id, a, b) {
    const ad = await contentDb.prepare("SELECT * FROM ads WHERE id = ?").get(+id);
    if (!ad) throw bad("No such ad.", 404);
    if (a === "pause") await contentDb.prepare("UPDATE ads SET review_status='paused', updated_at=? WHERE id=?").run(iso(), +id);
    else if (a === "resume") await contentDb.prepare("UPDATE ads SET review_status='approved', reject_reason=NULL, updated_at=? WHERE id=?").run(iso(), +id);
    else if (a === "delete") { await contentDb.prepare("DELETE FROM ads WHERE id=?").run(+id); await contentDb.prepare("DELETE FROM ad_events WHERE ad_id=?").run(+id); }
    else if (a === "edit") {
      const d = { ...JSON.parse(ad.data), brand: (b.brand || "").trim(), tagline: (b.tagline || "").trim(), url: (b.url || "").trim() };
      if (!d.brand || !validUrl(d.url)) throw bad("Brand and a valid destination URL are required.");
      await contentDb.prepare("UPDATE ads SET data=?, advertiser_id=?, starts_at=?, ends_at=?, total_budget_cents=?, cpm_cents=?, updated_at=? WHERE id=?")
        .run(JSON.stringify(d), b.advertiser_id || null, b.starts_at || null, b.ends_at || null, b.total_budget ? Math.round(+b.total_budget * 100) : null, b.cpm ? Math.round(+b.cpm * 100) : 500, iso(), +id);
    } else throw bad("Unknown action.");
  },
  async adreview(staff, id, a, b) {
    if (a === "approve") await contentDb.prepare("UPDATE ads SET review_status='approved', reject_reason=NULL, updated_at=? WHERE id=?").run(iso(), +id);
    else if (a === "reject") { if (!b.reason) throw bad("Pick a policy reason."); await contentDb.prepare("UPDATE ads SET review_status='rejected', reject_reason=?, updated_at=? WHERE id=?").run(b.reason, iso(), +id); }
    else throw bad("Unknown action.");
  },
  async advertisers(staff, id, a, b) {
    if (a === "edit") { if (!b.name?.trim()) throw bad("Name required."); await contentDb.prepare("UPDATE advertisers SET name=?, contact_email=?, notes=? WHERE id=?").run(b.name.trim(), b.contact_email || null, b.notes || null, id); }
    else if (a === "suspend") await contentDb.prepare("UPDATE advertisers SET status='suspended' WHERE id=?").run(id);
    else if (a === "activate") await contentDb.prepare("UPDATE advertisers SET status='active' WHERE id=?").run(id);
    else throw bad("Unknown action.");
  },
  async support(staff, id, a, b) {
    const t = await identityDb.prepare("SELECT * FROM support_tickets WHERE id = ?").get(id);
    if (!t) throw bad("No such ticket.", 404);
    const now = iso();
    if (a === "reply" || a === "note") {
      const body = (b.body || "").trim(); if (!body) throw bad("Write a message first.");
      await identityDb.prepare("INSERT INTO support_messages (id, ticket_id, kind, author_id, body, created_at) VALUES (?,?,?,?,?,?)").run(uid(), id, a === "reply" ? "staff" : "note", staff.id, body, now);
      if (a === "reply") {
        await identityDb.prepare("UPDATE support_tickets SET status='pending', first_response_at=COALESCE(first_response_at, ?), assignee_id=COALESCE(assignee_id, ?), updated_at=? WHERE id=?").run(now, staff.id, now, id);
        if (t.account_id) await createNotification(t.account_id, "support", `Support replied to “${cut(t.subject, 50)}”.`).catch(() => {});
      }
    } else if (a === "take") await identityDb.prepare("UPDATE support_tickets SET assignee_id=?, updated_at=? WHERE id=?").run(staff.id, now, id);
    else if (a === "priority") { if (!SLA_H[b.value]) throw bad("Pick a priority."); await identityDb.prepare("UPDATE support_tickets SET priority=?, updated_at=? WHERE id=?").run(b.value, now, id); }
    else if (a === "status" || a === "resolve") {
      const st = a === "resolve" ? "resolved" : b.value; if (!TICKET_STATUS.includes(st)) throw bad("Pick a status.");
      if (a === "resolve" && (b.body || "").trim()) await identityDb.prepare("INSERT INTO support_messages (id, ticket_id, kind, author_id, body, created_at) VALUES (?,?,?,?,?,?)").run(uid(), id, "staff", staff.id, b.body.trim(), now);
      await identityDb.prepare("UPDATE support_tickets SET status=?, resolved_at=?, first_response_at=COALESCE(first_response_at, ?), updated_at=? WHERE id=?").run(st, ["resolved", "closed"].includes(st) ? now : null, now, now, id);
      if (["resolved", "closed"].includes(st) && t.account_id) await createNotification(t.account_id, "support", `Your support request “${cut(t.subject, 50)}” was marked ${st}.`).catch(() => {});
    } else throw bad("Unknown action.");
  },
  async supportmacros(staff, id, a, b) {
    if (a === "delete") await identityDb.prepare("DELETE FROM support_macros WHERE id=?").run(id);
    else if (a === "edit") { if (!b.title?.trim() || !b.body?.trim()) throw bad("Title and text required."); await identityDb.prepare("UPDATE support_macros SET title=?, body=? WHERE id=?").run(b.title.trim(), b.body.trim(), id); }
    else throw bad("Unknown action.");
  },
  async payments(staff, id, a, b) {
    const acct = await identityDb.prepare("SELECT id, stripe_customer_id, stripe_subscription_id FROM accounts WHERE id = ?").get(id);
    if (!acct) throw bad("No such account.", 404);
    if (a === "set_plan") { if (!["basic", "plus", "pro"].includes(b.plan)) throw bad("Pick a plan."); await setPremiumTier(id, b.plan); return; }
    if (a === "stripe_open") { if (!acct.stripe_customer_id) throw bad("No Stripe customer."); return { url: `https://dashboard.stripe.com/customers/${acct.stripe_customer_id}` }; }
    if (!isStripeConfigured()) throw bad("Stripe isn't configured on this server.");
    const stripe = getStripe();
    if (a === "cancel_sub") { if (!acct.stripe_subscription_id) throw bad("No active Stripe subscription."); await stripe.subscriptions.update(acct.stripe_subscription_id, { cancel_at_period_end: true }); return; }
    if (a === "refund") {
      if (!acct.stripe_customer_id) throw bad("No Stripe customer.");
      const inv = (await stripe.invoices.list({ customer: acct.stripe_customer_id, limit: 5, status: "paid" })).data.find((i) => i.payment_intent || i.charge);
      if (!inv) throw bad("No paid invoice found to refund.");
      await stripe.refunds.create(inv.payment_intent ? { payment_intent: inv.payment_intent } : { charge: inv.charge }); return;
    }
    throw bad("Unknown action.");
  },
  async promos(staff, id, a) {
    if (a !== "deactivate") throw bad("Unknown action."); await getStripe().promotionCodes.update(id, { active: false });
  },
  async feedcontrols(staff, id, a, b) {
    const v = String(b.value ?? "").trim();
    if (id === "ads_enabled") { if (!["on", "off"].includes(v)) throw bad("Choose on or off."); await putSetting(staff, "ads_enabled", v === "on" ? "1" : "0"); }
    else if (id === "ad_every") { const n = Math.round(+v); if (!(n >= 2 && n <= 50)) throw bad("Enter a number from 2 to 50."); await putSetting(staff, "ad_every", String(n)); }
    else throw bad("Unknown setting.");
  },
  async announcements(staff, id, a, b) {
    if (a === "delete") await contentDb.prepare("DELETE FROM announcements WHERE id=?").run(id);
    else if (a === "turn_off") await contentDb.prepare("UPDATE announcements SET active=0 WHERE id=?").run(id);
    else if (a === "turn_on") await contentDb.prepare("UPDATE announcements SET active=1 WHERE id=?").run(id);
    else if (a === "edit") { if (!b.title?.trim()) throw bad("Headline required."); await contentDb.prepare("UPDATE announcements SET title=?, body=?, severity=?, audience=?, starts_at=?, ends_at=? WHERE id=?").run(b.title.trim(), b.body || null, b.severity || "info", b.audience || "all", b.starts_at || null, b.ends_at ? b.ends_at + "T23:59:59.999Z" : null, id); }
    else throw bad("Unknown action.");
  },
};
async function putSetting(staff, key, value) {
  await contentDb.prepare("INSERT INTO feed_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at").run(key, value, staff.id, iso());
}

export const CREATE = {
  async ads(staff, b) {
    const brand = (b.brand || "").trim(), url = (b.url || "").trim();
    if (!brand || !(b.tagline || "").trim()) throw bad("Brand and ad copy are required.");
    if (!validUrl(url)) throw bad("Enter a valid https:// destination URL.");
    const id = Number((await contentDb.prepare("SELECT COALESCE(MAX(id),0)+1 AS n FROM ads").get()).n);
    await contentDb.prepare("INSERT INTO ads (id, data, review_status, advertiser_id, starts_at, ends_at, total_budget_cents, cpm_cents, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, JSON.stringify({ brand, tagline: b.tagline.trim(), url }), "approved", b.advertiser_id || null, b.starts_at || null, b.ends_at ? b.ends_at + "T23:59:59.999Z" : null, b.total_budget ? Math.round(+b.total_budget * 100) : null, b.cpm ? Math.round(+b.cpm * 100) : 500, iso(), iso());
  },
  async advertisers(staff, b) { if (!b.name?.trim()) throw bad("Name required."); await contentDb.prepare("INSERT INTO advertisers (id, name, contact_email, notes, created_at) VALUES (?,?,?,?,?)").run(uid(), b.name.trim(), b.contact_email || null, b.notes || null, iso()); },
  async supportmacros(staff, b) { if (!b.title?.trim() || !b.body?.trim()) throw bad("Title and text required."); await identityDb.prepare("INSERT INTO support_macros (id, title, body, created_at) VALUES (?,?,?,?)").run(uid(), b.title.trim(), b.body.trim(), iso()); },
  async announcements(staff, b) {
    if (!b.title?.trim()) throw bad("Headline required.");
    await contentDb.prepare("INSERT INTO announcements (id, title, body, severity, audience, starts_at, ends_at, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)").run(uid(), b.title.trim(), b.body || null, b.severity || "info", b.audience || "all", b.starts_at || null, b.ends_at ? b.ends_at + "T23:59:59.999Z" : null, staff.id, iso());
  },
  async promos(staff, b) {
    if (!isStripeConfigured()) throw bad("Stripe isn't configured on this server.");
    const pct = Math.round(+b.percent_off); if (!(pct >= 1 && pct <= 100)) throw bad("Percent off must be 1–100.");
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(b.code || "")) throw bad("Code: 3–30 letters, numbers, - or _.");
    const stripe = getStripe();
    const coupon = await stripe.coupons.create({ percent_off: pct, duration: b.duration || "once", ...(b.duration === "repeating" ? { duration_in_months: Math.max(1, Math.round(+b.months || 1)) } : {}) });
    await stripe.promotionCodes.create({ coupon: coupon.id, code: b.code.toUpperCase(), ...(b.max_redemptions ? { max_redemptions: Math.round(+b.max_redemptions) } : {}) });
  },
};

// ---------------- sidebar badges + global search ----------------
export async function badges() {
  const [reports, appeals, verification, support, adreview, dm, companies] = await Promise.all([
    safe(() => num(contentDb, "SELECT COUNT(*) AS n FROM content_reports WHERE status='open'")),
    safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM appeals WHERE status='pending'")),
    safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM verification_requests WHERE status='pending'")),
    safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM support_tickets WHERE status IN ('open','pending') AND assignee_id IS NULL")),
    safe(() => num(contentDb, "SELECT COUNT(*) AS n FROM ads WHERE review_status='pending'")),
    safe(() => num(contentDb, "SELECT COUNT(*) AS n FROM dm_reports WHERE status='open'")),
    safe(() => num(contentDb, "SELECT COUNT(*) AS n FROM companies WHERE verification='submitted'")),
  ]);
  const dmca = await safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM dmca_notices WHERE status='open'"));
  const legal = await safe(() => num(identityDb, "SELECT COUNT(*) AS n FROM legal_requests WHERE status='open'"));
  return { reports, appeals, verification, support, adreview, dm, companies, dmca, legal };
}

export async function globalSearch(staff, q) {
  q = (q || "").trim(); if (q.length < 2) return [];
  const like = `%${q}%`, out = [];
  if (can(staff.role, "users.read")) {
    (await identityDb.prepare("SELECT id, pseudonym, status FROM accounts WHERE pseudonym ILIKE ? OR id = ? LIMIT 6").all(like, q)).forEach((u) => out.push({ type: "User", label: u.pseudonym, sub: u.status, href: `/admin/users?open=${u.id}` }));
    if (can(staff.role, "users.pii")) (await identityDb.prepare("SELECT id, pseudonym, email FROM accounts WHERE email ILIKE ? LIMIT 4").all(like)).forEach((u) => out.push({ type: "User", label: u.email, sub: u.pseudonym, href: `/admin/users?open=${u.id}` }));
  }
  if (can(staff.role, "content.moderate")) (await contentDb.prepare("SELECT id, text, author_display FROM posts WHERE id = ? OR text ILIKE ? ORDER BY created_at DESC LIMIT 5").all(q, like)).forEach((p) => out.push({ type: "Post", label: cut(p.text, 70), sub: p.author_display, href: `/admin/moderation?q=${encodeURIComponent(p.id)}` }));
  if (can(staff.role, "companies.manage")) (await contentDb.prepare("SELECT id, name FROM companies WHERE name ILIKE ? LIMIT 4").all(like)).forEach((c) => out.push({ type: "Company", label: c.name, sub: "", href: `/admin/companies?q=${encodeURIComponent(c.name)}` }));
  if (can(staff.role, "support.handle")) (await identityDb.prepare("SELECT id, subject FROM support_tickets WHERE subject ILIKE ? OR id LIKE ? LIMIT 4").all(like, q.toLowerCase().replace(/^t-/, "") + "%")).forEach((t) => out.push({ type: "Ticket", label: cut(t.subject, 60), sub: "T-" + t.id.slice(0, 6).toUpperCase(), href: `/admin/support/${t.id}` }));
  return out;
}
