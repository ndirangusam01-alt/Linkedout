// Data access for the admin dashboard. Everything here is real SQL against
// the existing identity/content stores — there is no mock data. Each
// section exposes LIST (what to show) and ACT (what staff can do to a row);
// the generic web/native UIs render whatever these return.
import { identityDb } from "@/lib/identity/db";
import { contentDb } from "@/lib/content/db";
import { getVerificationDocumentSignedUrl } from "@/lib/identity/documents";
import { reviewVerificationRequest } from "@/lib/identity/service";
import { can } from "./roles";
import { applyEnforcement, logStaff, accountIdForAnonymousId } from "./enforce";
import * as SYS from "./systems";

const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const uid = () => crypto.randomUUID();
const safe = async (fn, fb = 0) => { try { return await fn(); } catch { return fb; } };
const n = async (db, sql, ...p) => Number((await db.prepare(sql).get(...p))?.n ?? 0);
const cut = (s, k = 90) => (s && s.length > k ? s.slice(0, k) + "…" : s || "");
const day0 = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };
const PRICE = { plus: 4.99, pro: 9.99 }; // matches app/premium/page.js defaults
const bad = (m, status = 400) => Object.assign(new Error(m), { status });

// ---------------- Command Center ----------------
async function perMinute(db, table, minutes = 30, where = "") {
  const rows = await db.prepare(`SELECT substr(created_at,1,16) AS m, COUNT(*) AS c FROM ${table} WHERE created_at >= ? ${where} GROUP BY m`).all(iso(minutes * 60000));
  const map = new Map(rows.map((r) => [r.m, Number(r.c)]));
  return Array.from({ length: minutes }, (_, i) => map.get(iso((minutes - 1 - i) * 60000).slice(0, 16)) || 0);
}

async function badgesLite() { return (await import("./systems")).badges(); }

export async function overview() {
  const t0 = Date.now();
  const I = identityDb, C = contentDb, today = day0(), wk = iso(7 * 864e5);
  const [total, newToday, newWeek, dau, mau, online, suspended, restricted, locked, appealsPending, verifPending, billing] = await Promise.all([
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts")),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?", today)),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?", wk)),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM daily_active WHERE day = ?", today.slice(0, 10))),
    safe(() => n(I, "SELECT COUNT(DISTINCT account_id) AS n FROM daily_active WHERE day >= ?", iso(29 * 864e5).slice(0, 10))),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE last_seen_at >= ?", iso(5 * 60000))),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE status IN ('suspended','banned')")),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE restrictions <> '[]'")),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM accounts WHERE status = 'locked'")),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM appeals WHERE status = 'pending'")),
    safe(() => n(I, "SELECT COUNT(*) AS n FROM verification_requests WHERE status = 'pending'")),
    safe(() => I.prepare("SELECT premium_tier AS t, COUNT(*) AS n FROM accounts WHERE premium_tier <> 'basic' GROUP BY premium_tier").all(), []),
  ]);
  const [postsToday, repostsToday, commentsToday, reactionsToday, likesToday, mediaToday, removed, reportsToday, reportsPending, dmReportsOpen, disputesOpen, msgsToday, spamReports] = await Promise.all([
    safe(() => n(C, "SELECT COUNT(*) AS n FROM posts WHERE repost_of IS NULL AND created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM posts WHERE repost_of IS NOT NULL AND created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM comments WHERE created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM reactions WHERE created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM likes WHERE created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM posts WHERE media_path IS NOT NULL AND created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM posts WHERE visibility = 'removed'")),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM content_reports WHERE created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM content_reports WHERE status = 'open'")),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM dm_reports WHERE status = 'open'")),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM company_disputes WHERE status = 'open'")),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM dm_messages WHERE created_at >= ?", today)),
    safe(() => n(C, "SELECT COUNT(*) AS n FROM content_reports WHERE reason ILIKE '%spam%' AND status = 'open'")),
  ]);
  const [sPosts, sReposts, sLikes, sComments, sReact] = await Promise.all([
    safe(() => perMinute(C, "posts", 30, "AND repost_of IS NULL"), []), safe(() => perMinute(C, "posts", 30, "AND repost_of IS NOT NULL"), []),
    safe(() => perMinute(C, "likes"), []), safe(() => perMinute(C, "comments"), []), safe(() => perMinute(C, "reactions"), []),
  ]);
  const [att, recent, signups14, dau14] = await Promise.all([
    badgesLite(),
    safe(() => identityDb.prepare("SELECT l.action, l.actor_role, l.target, l.created_at, a.pseudonym FROM staff_audit_log l LEFT JOIN accounts a ON a.id = l.actor_id ORDER BY l.created_at DESC LIMIT 8").all(), []),
    safe(() => identityDb.prepare("SELECT substr(created_at,1,10) d, COUNT(*) c FROM accounts WHERE created_at >= ? GROUP BY d").all(iso(14 * 864e5)), []),
    safe(() => identityDb.prepare("SELECT day d, COUNT(*) c FROM daily_active WHERE day >= ? GROUP BY day").all(iso(14 * 864e5).slice(0, 10)), []),
  ]);
  const days14 = Array.from({ length: 14 }, (_, i) => iso((13 - i) * 864e5).slice(0, 10));
  const m14 = (rows) => { const m = new Map(rows.map((r) => [r.d, Number(r.c)])); return days14.map((d) => m.get(d) || 0); }
  const mrr = billing.reduce((s, r) => s + (PRICE[r.t] || 0) * Number(r.n), 0);
  const dbLatency = Date.now() - t0;
  return {
    at: iso(),
    kpis: {
      totalUsers: total, dau, mau, onlineNow: online, newToday, newWeek,
      postsToday, repostsToday, commentsToday, reactionsToday, likesToday, messagesToday: msgsToday, mediaToday,
      reportsToday, reportsPending: reportsPending + dmReportsOpen + disputesOpen, appealsPending, verificationPending: verifPending,
      suspended, restricted, locked, contentRemoved: removed, spamFlagged: spamReports,
      subscribers: billing.reduce((s, r) => s + Number(r.n), 0), mrrEstimate: Math.round(mrr * 100) / 100,
    },
    series: { posts: sPosts, reposts: sReposts, likes: sLikes, replies: sComments, reactions: sReact },
    attention: att,
    recent: recent.map((r) => ({ who: r.pseudonym || "staff", role: r.actor_role, action: r.action, target: r.target ? String(r.target).slice(0, 10) : "", at: r.created_at })),
    trends: { days: days14, signups: m14(signups14), dau: m14(dau14) },
    health: { dbLatencyMs: dbLatency, uptimeSec: Math.round(process.uptime()), status: dbLatency < 1500 ? "healthy" : "degraded" },
  };
}

// ---------------- Users ----------------
export async function listUsers(staff, { q = "", status = "", limit = 50 } = {}) {
  const pii = can(staff.role, "users.pii");
  const like = `%${q.trim()}%`;
  const rows = await identityDb.prepare(
    `SELECT id, pseudonym, email, real_name, status, role, premium_tier, email_verified, phone_verified, government_id_status, restrictions, created_at, last_seen_at
     FROM accounts WHERE (? = '' OR pseudonym ILIKE ? OR id = ? ${pii ? "OR email ILIKE ? OR real_name ILIKE ?" : ""})
     AND (? = '' OR status = ?) ORDER BY created_at DESC LIMIT ?`
  ).all(...[q.trim(), like, q.trim(), ...(pii ? [like, like] : []), status, status, Math.min(+limit || 50, 200)]);
  return rows.map((r) => ({
    id: r.id, pseudonym: r.pseudonym, status: r.status, role: r.role, tier: r.premium_tier,
    emailVerified: !!r.email_verified, phoneVerified: !!r.phone_verified, idStatus: r.government_id_status,
    restrictions: JSON.parse(r.restrictions || "[]"), createdAt: r.created_at, lastSeenAt: r.last_seen_at,
    ...(pii ? { email: r.email, realName: r.real_name } : {}),
  }));
}

export async function userDetail(staff, id) {
  const pii = can(staff.role, "users.pii");
  const a = await identityDb.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
  if (!a) throw bad("No such user.", 404);
  const anon = await identityDb.prepare("SELECT anonymous_id FROM anonymous_identities WHERE account_id = ?").all(id);
  const ids = anon.map((x) => x.anonymous_id);
  const enforcements = await identityDb.prepare("SELECT id, action, reason, issued_by, expires_at, revoked_at, created_at FROM enforcements WHERE account_id = ? ORDER BY created_at DESC").all(id);
  const posts = ids.length ? await safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM posts WHERE anonymous_id = ANY(?)", ids)) : 0;
  const openReports = ids.length ? await safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM content_reports r JOIN posts p ON p.id = r.target_id WHERE r.target_type='post' AND r.status='open' AND p.anonymous_id = ANY(?)", ids)) : 0;
  const followers = await safe(() => n(identityDb, "SELECT COUNT(*) AS n FROM follows WHERE followed_handle = ?", a.pseudonym));
  await logStaff(staff, "view_user", id);
  return {
    id: a.id, pseudonym: a.pseudonym, bio: a.bio, status: a.status, statusUntil: a.status_until, role: a.role, label: a.account_label,
    tier: a.premium_tier, subscriptionStatus: a.subscription_status, emailVerified: !!a.email_verified, phoneVerified: !!a.phone_verified,
    idStatus: a.government_id_status, businessStatus: a.business_verified_status, professionalStatus: a.professional_verified_status,
    country: a.country, accountType: a.account_type, restrictions: JSON.parse(a.restrictions || "[]"), mustResetPassword: !!a.must_reset_password,
    createdAt: a.created_at, lastSeenAt: a.last_seen_at, deactivated: !!a.deactivated, followers, posts, openReportsAgainst: openReports,
    identities: ids.length, enforcements,
    ...(pii ? { email: a.email, realName: a.real_name, phone: a.phone } : {}),
  };
}

// ---------------- Generic sections ----------------
const col = (key, label) => ({ key, label });
const tbl = (columns, rows, extra = {}) => ({ columns, rows, actions: [], summary: [], ...extra });
const REASON = { key: "reason", label: "Reason / note" };

export const LIST = {
  async analytics() {
    const days = Array.from({ length: 14 }, (_, i) => iso(i * 864e5).slice(0, 10));
    const per = async (db, table, extra = "") => new Map((await safe(() => db.prepare(`SELECT substr(created_at,1,10) d, COUNT(*) c FROM ${table} WHERE created_at >= ? ${extra} GROUP BY d`).all(iso(14 * 864e5)), [])).map((r) => [r.d, r.c]));
    const [su, po, co, re] = await Promise.all([per(identityDb, "accounts"), per(contentDb, "posts", "AND repost_of IS NULL"), per(contentDb, "comments"), per(contentDb, "reactions")]);
    const li = await per(contentDb, "likes");
    const da = new Map((await safe(() => identityDb.prepare("SELECT day d, COUNT(*) c FROM daily_active WHERE day >= ? GROUP BY day").all(iso(14 * 864e5).slice(0, 10)), [])).map((r) => [r.d, r.c]));
    const o = await overview();
    return tbl([col("day", "Day"), col("dau", "Active users"), col("signups", "Signups"), col("posts", "Posts"), col("replies", "Replies"), col("likes", "Likes"), col("reactions", "Reactions")],
      days.map((d) => ({ id: d, day: d, dau: +(da.get(d) || 0), signups: +(su.get(d) || 0), posts: +(po.get(d) || 0), replies: +(co.get(d) || 0), likes: +(li.get(d) || 0), reactions: +(re.get(d) || 0) })),
      { summary: [["DAU", o.kpis.dau], ["MAU", o.kpis.mau], ["Stickiness", o.kpis.mau ? Math.round((o.kpis.dau / o.kpis.mau) * 100) + "%" : "—"], ["New this week", o.kpis.newWeek]] });
  },

  async enforcements() {
    const r = await identityDb.prepare(`SELECT e.*, a.pseudonym FROM enforcements e LEFT JOIN accounts a ON a.id = e.account_id ORDER BY e.created_at DESC LIMIT 200`).all();
    return tbl([col("when", "When"), col("user", "Account"), col("action", "Action"), col("reason", "Reason"), col("by", "By"), col("state", "State")],
      r.map((x) => ({ id: x.id, when: x.created_at.slice(0, 16).replace("T", " "), user: x.pseudonym || x.account_id.slice(0, 8), action: x.action, reason: cut(x.reason), by: x.issued_by, state: x.revoked_at ? "revoked" : x.expires_at && x.expires_at < iso() ? "expired" : "active" })),
      { actions: [{ id: "revoke", label: "Revoke", perm: "users.enforce.severe", input: REASON, danger: false }] });
  },

  async verification(staff) {
    const r = await identityDb.prepare(`SELECT v.*, a.pseudonym FROM verification_requests v LEFT JOIN accounts a ON a.id = v.account_id ORDER BY (v.status='pending') DESC, v.created_at DESC LIMIT 100`).all();
    const actions = [{ id: "approved", label: "Approve", input: { key: "note", label: "Note (optional)", optional: true } }, { id: "rejected", label: "Reject", danger: true, input: REASON }];
    if (can(staff.role, "verification.docs")) actions.push({ id: "document", label: "View document" });
    return tbl([col("created", "Submitted"), col("user", "Account"), col("type", "Type"), col("notes", "Notes"), col("status", "Status"), col("doc", "Document")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), user: x.pseudonym, type: x.type, notes: cut(x.submitted_data), status: x.status, doc: x.document_path ? "yes" : "no", _pending: x.status === "pending" })),
      { actions, pendingOnly: ["approved", "rejected"], summary: [["Pending", r.filter((x) => x.status === "pending").length]] });
  },

  async companies() {
    const r = await contentDb.prepare("SELECT id, name, industry, status, verification, domain_verified, created_at FROM companies ORDER BY (verification='submitted') DESC, created_at DESC LIMIT 100").all();
    const disputes = await safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM company_disputes WHERE status='open'"));
    return tbl([col("name", "Company"), col("industry", "Industry"), col("status", "Status"), col("verification", "Verification"), col("domain", "Domain"), col("created", "Created")],
      r.map((x) => ({ id: x.id, name: x.name, industry: x.industry, status: x.status, verification: x.verification, domain: x.domain_verified ? "verified" : "—", created: x.created_at.slice(0, 10) })),
      { summary: [["Companies", r.length], ["Open disputes", disputes]], actions: [{ id: "verify", label: "Verify" }, { id: "reject", label: "Reject", input: REASON }, { id: "suspend", label: "Suspend", danger: true, input: REASON }, { id: "restore", label: "Restore" }] });
  },

  async network() {
    const top = await identityDb.prepare("SELECT followed_handle h, COUNT(*) c FROM follows GROUP BY h ORDER BY c DESC LIMIT 15").all();
    const burst = await identityDb.prepare("SELECT f.follower_account_id id, a.pseudonym p, COUNT(*) c FROM follows f LEFT JOIN accounts a ON a.id = f.follower_account_id WHERE f.created_at >= ? GROUP BY f.follower_account_id, a.pseudonym HAVING COUNT(*) >= 25 ORDER BY c DESC LIMIT 25").all(iso(864e5));
    const topH = top.map((t) => t.h);
    const edgesRaw = topH.length ? await identityDb.prepare("SELECT a.pseudonym f, fl.followed_handle t FROM follows fl JOIN accounts a ON a.id = fl.follower_account_id WHERE fl.followed_handle = ANY(?) AND a.pseudonym IS NOT NULL LIMIT 500").all(topH) : [];
    const flagged = new Set(burst.map((b) => b.p));
    const deg = new Map(); const pair = new Set(edgesRaw.map((e) => e.f + ">" + e.t));
    for (const e of edgesRaw) { deg.set(e.t, (deg.get(e.t) || 0) + 1); if (!deg.has(e.f)) deg.set(e.f, 0); }
    const graph = { nodes: [...deg.entries()].slice(0, 160).map(([id, d]) => ({ id, followers: d, flagged: flagged.has(id) })), edges: edgesRaw.map((e) => ({ a: e.f, b: e.t, mutual: pair.has(e.t + ">" + e.f) })) };
    graph.edges = graph.edges.filter((e) => graph.nodes.some((n) => n.id === e.a) && graph.nodes.some((n) => n.id === e.b));
    return tbl([col("kind", "Signal"), col("who", "Account"), col("count", "Count")],
      [...burst.map((b) => ({ id: "b" + b.id, kind: "Mass-follow (24h)", who: b.p, count: +b.c })), ...top.map((t) => ({ id: "t" + t.h, kind: "Most followed", who: t.h, count: +t.c }))],
      { graph, summary: [["Follows (24h)", await safe(() => n(identityDb, "SELECT COUNT(*) AS n FROM follows WHERE created_at >= ?", iso(864e5)))], ["Mass-follow flags", burst.length]] });
  },

  async moderation() {
    const r = await contentDb.prepare(
      `SELECT p.id, p.type, p.text, p.author_display, p.visibility, p.flag, p.created_at, p.mod_reason,
        (SELECT COUNT(*) FROM content_reports r WHERE r.target_type='post' AND r.target_id = p.id AND r.status='open') AS reports
       FROM posts p WHERE p.repost_of IS NULL ORDER BY (SELECT COUNT(*) FROM content_reports r WHERE r.target_type='post' AND r.target_id = p.id AND r.status='open') DESC, p.created_at DESC LIMIT 100`).all();
    return tbl([col("created", "Posted"), col("author", "Author"), col("text", "Content"), col("reports", "Open reports"), col("visibility", "State")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), author: x.author_display, text: cut(x.text, 120), reports: +x.reports, visibility: x.visibility })),
      { summary: [["Queue (reported)", r.filter((x) => +x.reports > 0).length]],
        actions: [{ id: "remove", label: "Remove", danger: true, input: REASON }, { id: "restore", label: "Restore" },
          { id: "warn_author", label: "Warn author", input: REASON }, { id: "limit_author", label: "Limit author posting", input: REASON }] });
  },

  async reports() {
    const r = await contentDb.prepare("SELECT * FROM content_reports ORDER BY (status='open') DESC, created_at DESC LIMIT 150").all();
    return tbl([col("created", "Filed"), col("target", "Target"), col("reason", "Reason"), col("details", "Details"), col("status", "Status")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), target: `${x.target_type}:${x.target_id.slice(0, 8)}`, reason: x.reason, details: cut(x.details), status: x.status })),
      { detail: true, summary: [["Open", r.filter((x) => x.status === "open").length], ["Resolved", r.filter((x) => x.status !== "open").length]],
        pendingOnly: ["action_taken", "dismiss"],
        actions: [{ id: "action_taken", label: "Remove content", danger: true, input: REASON }, { id: "dismiss", label: "Dismiss", input: { key: "reason", label: "Note", optional: true } }] });
  },

  async appeals() {
    const r = await identityDb.prepare("SELECT ap.*, a.pseudonym FROM appeals ap LEFT JOIN accounts a ON a.id = ap.account_id ORDER BY (ap.status='pending') DESC, ap.created_at DESC LIMIT 100").all();
    const dec = r.filter((x) => x.decided_at);
    const acc = dec.filter((x) => x.status === "accepted").length;
    const avgH = dec.length ? Math.round(dec.reduce((s, x) => s + (new Date(x.decided_at) - new Date(x.created_at)), 0) / dec.length / 36e5) : 0;
    return tbl([col("created", "Filed"), col("user", "Account"), col("message", "Appeal"), col("status", "Status")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), user: x.pseudonym, message: cut(x.message, 120), status: x.status })),
      { detail: true, summary: [["Pending", r.filter((x) => x.status === "pending").length], ["Accepted", acc], ["Rejected", dec.length - acc], ["Success rate", dec.length ? Math.round((acc / dec.length) * 100) + "%" : "—"], ["Avg processing", avgH + "h"]],
        pendingOnly: ["accepted", "rejected"],
        actions: [{ id: "accepted", label: "Accept & restore", perm: "appeals.handle", input: REASON }, { id: "rejected", label: "Reject", danger: true, perm: "appeals.handle", input: REASON }] });
  },

  async spam() {
    const dup = await contentDb.prepare("SELECT md5(text) h, MIN(text) sample, COUNT(*) c, COUNT(DISTINCT anonymous_id) a FROM posts WHERE created_at >= ? AND visibility <> 'removed' GROUP BY md5(text) HAVING COUNT(*) >= 3 ORDER BY c DESC LIMIT 30").all(iso(864e5));
    return tbl([col("sample", "Repeated content (24h)"), col("count", "Copies"), col("authors", "Distinct authors")],
      dup.map((d) => ({ id: d.h, sample: cut(d.sample, 100), count: +d.c, authors: +d.a })),
      { summary: [["Duplicate clusters", dup.length]], actions: [{ id: "remove_all", label: "Remove all copies", danger: true, input: REASON }] });
  },

  async dmca() {
    const r = await identityDb.prepare("SELECT * FROM dmca_notices ORDER BY (status='open') DESC, created_at DESC LIMIT 100").all();
    return tbl([col("created", "Received"), col("claimant", "Claimant"), col("post", "Post"), col("description", "Description"), col("status", "Status")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 10), claimant: x.claimant, post: x.target_post_id || x.target_url, description: cut(x.description), status: x.status })),
      { detail: true, pendingOnly: ["takedown", "rejected"], actions: [{ id: "takedown", label: "Take down", danger: true }, { id: "rejected", label: "Reject", input: REASON }],
        create: [{ key: "claimant", label: "Claimant" }, { key: "target_post_id", label: "Post ID" }, { key: "description", label: "Description" }] });
  },

  async legal() {
    const r = await identityDb.prepare("SELECT * FROM legal_requests ORDER BY (status='open') DESC, deadline ASC NULLS LAST LIMIT 100").all();
    return tbl([col("agency", "Agency"), col("type", "Type"), col("subject", "Subject"), col("deadline", "Deadline"), col("status", "Status")],
      r.map((x) => ({ id: x.id, agency: x.agency, type: x.type, subject: cut(x.subject), deadline: x.deadline?.slice(0, 10), status: x.status })),
      { detail: true, pendingOnly: ["complied", "contested"], actions: [{ id: "complied", label: "Mark complied", input: REASON }, { id: "contested", label: "Contest", input: REASON }],
        create: [{ key: "agency", label: "Agency / court" }, { key: "type", label: "Type (subpoena, preservation…)" }, { key: "subject", label: "Subject" }, { key: "deadline", label: "Deadline (YYYY-MM-DD)" }] });
  },

  async breakglass() {
    const r = await identityDb.prepare("SELECT * FROM break_glass_requests ORDER BY requested_at DESC LIMIT 100").all();
    return tbl([col("requested", "Requested"), col("anon", "Anonymous ID"), col("reason", "Reason"), col("by", "Requested by"), col("status", "Status"), col("approver", "Approved by")],
      r.map((x) => ({ id: x.id, requested: x.requested_at.slice(0, 16).replace("T", " "), anon: x.anonymous_id.slice(0, 10) + "…", reason: cut(x.reason), by: x.requested_by, status: x.status, approver: x.approved_by || "—" })),
      { summary: [["Pending", r.filter((x) => x.status === "pending").length]] });
    // Read-only by design: filing/approving stays in scripts/break-glass-*.js (two distinct operators).
  },

  async feed() {
    const r = await contentDb.prepare("SELECT id, text, author_display, pinned, cringe_nominated, cringe_votes, visibility FROM posts WHERE (pinned = 1 OR cringe_nominated = 1) AND visibility <> 'removed' ORDER BY cringe_votes DESC LIMIT 60").all();
    return tbl([col("text", "Post"), col("author", "Author"), col("pinned", "Pinned"), col("cringe", "Cringe votes")],
      r.map((x) => ({ id: x.id, text: cut(x.text, 100), author: x.author_display, pinned: x.pinned ? "yes" : "—", cringe: x.cringe_nominated ? +x.cringe_votes : "—" })),
      { summary: [["Pinned", r.filter((x) => x.pinned).length], ["On cringe board", r.filter((x) => x.cringe_nominated).length]], create: [{ key: "post_id", label: "Post ID to pin (copy it from Content Moderation)" }], createLabel: "+ Pin a post",
        actions: [{ id: "unpin", label: "Unpin", when: { pinned: ["yes"] } }, { id: "denominate", label: "Remove from cringe board", when: { cringe: ["*"] } }, { id: "remove", label: "Remove post", danger: true, input: REASON }] });
  },

  async search() {
    const r = await contentDb.prepare("SELECT * FROM blocked_terms ORDER BY created_at DESC").all();
    return tbl([col("term", "Blocked term"), col("by", "Added by"), col("created", "Added")],
      r.map((x) => ({ id: x.term, term: x.term, by: x.added_by, created: x.created_at.slice(0, 10) })),
      { actions: [{ id: "unblock", label: "Unblock" }], create: [{ key: "term", label: "Term to block from search" }] });
  },

  async dm() {
    const [today, blocks, open] = await Promise.all([safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM dm_messages WHERE created_at >= ?", day0())), safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM dm_blocks")), safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM dm_reports WHERE status='open'"))]);
    const r = await contentDb.prepare("SELECT id, reason, details, status, created_at, (evidence_enc IS NOT NULL) AS has_evidence FROM dm_reports ORDER BY (status='open') DESC, created_at DESC LIMIT 100").all();
    return tbl([col("created", "Filed"), col("reason", "Reason"), col("details", "Details"), col("evidence", "Reporter evidence"), col("status", "Status")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), reason: x.reason, details: cut(x.details), evidence: x.has_evidence ? "attached (encrypted)" : "—", status: x.status })),
      { pendingOnly: ["actioned", "dismissed"], summary: [["Messages today", today], ["Blocked pairs", blocks], ["Open abuse reports", open], ["Encryption at rest", "100%"]],
        actions: [{ id: "actioned", label: "Mark actioned", input: REASON }, { id: "dismissed", label: "Dismiss" }] });
    // Message bodies are never decrypted here — only reporter-submitted evidence and metadata.
  },

  async rooms() {
    const r = await contentDb.prepare("SELECT id, topic, vibe, status, locked, created_by_display, created_at FROM rooms ORDER BY created_at DESC LIMIT 80").all();
    return tbl([col("topic", "Topic"), col("vibe", "Vibe"), col("host", "Host"), col("status", "Status"), col("locked", "Locked")],
      r.map((x) => ({ id: x.id, topic: cut(x.topic, 70), vibe: x.vibe, host: x.created_by_display, status: x.status, locked: x.locked ? "yes" : "no" })),
      { chips: "status", summary: [["Live now", r.filter((x) => x.status === "live").length], ["Ended", r.filter((x) => x.status === "ended").length]],
        actions: [
          { id: "end", label: "End room…", danger: true, when: { status: ["live"] }, input: { key: "mode", label: "What should happen to this room?", options: ["End room only", "End and delete the room"] } },
          { id: "delete", label: "Delete room", danger: true, input: REASON },
          { id: "lock", label: "Lock", when: { locked: ["no"] } }, { id: "unlock", label: "Unlock", when: { locked: ["yes"] } }] });
  },

  async jobs() {
    const r = await safe(() => contentDb.prepare("SELECT id, title, company_name, created_at FROM jobs ORDER BY created_at DESC LIMIT 60").all(), []);
    return tbl([col("title", "Title"), col("company", "Company"), col("created", "Created")], r.map((x) => ({ id: x.id, title: x.title, company: x.company_name, created: x.created_at.slice(0, 10) })),
      { summary: [["Module", "Paused (JOBS_ENABLED = false)"]] });
  },

  async payments() {
    const tiers = await identityDb.prepare("SELECT premium_tier t, COUNT(*) c FROM accounts GROUP BY premium_tier").all();
    const ev = await identityDb.prepare("SELECT b.*, a.pseudonym FROM billing_events b LEFT JOIN accounts a ON a.id = b.account_id ORDER BY b.created_at DESC LIMIT 100").all();
    const paid = tiers.filter((t) => PRICE[t.t]);
    return tbl([col("when", "When"), col("user", "Account"), col("event", "Event")],
      ev.map((x) => ({ id: x.id, when: x.created_at.slice(0, 16).replace("T", " "), user: x.pseudonym, event: x.event })),
      { summary: [...tiers.map((t) => [`${t.t} accounts`, +t.c]), ["MRR (estimate)", "$" + paid.reduce((s, t) => s + PRICE[t.t] * +t.c, 0).toFixed(2)]] });
  },

  async ads() {
    const r = await contentDb.prepare("SELECT id, data, review_status FROM ads ORDER BY id").all();
    return tbl([col("name", "Ad"), col("copy", "Copy"), col("review", "Review status")],
      r.map((x) => { const d = JSON.parse(x.data); return { id: String(x.id), name: d.brand || d.advertiser || d.title || `Ad ${x.id}`, copy: cut(d.text || d.body || d.headline || "", 100), review: x.review_status }; }),
      { actions: [{ id: "approved", label: "Approve" }, { id: "rejected", label: "Reject", danger: true }, { id: "paused", label: "Pause" }] });
  },

  async support() {
    const r = await identityDb.prepare("SELECT t.*, a.pseudonym FROM support_tickets t LEFT JOIN accounts a ON a.id = t.account_id ORDER BY (t.status='open') DESC, t.created_at DESC LIMIT 100").all();
    return tbl([col("created", "Opened"), col("user", "Account"), col("subject", "Subject"), col("priority", "Priority"), col("status", "Status")],
      r.map((x) => ({ id: x.id, created: x.created_at.slice(0, 16).replace("T", " "), user: x.pseudonym || "—", subject: cut(x.subject), priority: x.priority, status: x.status })),
      { summary: [["Open", r.filter((x) => x.status === "open").length]], pendingOnly: ["resolved", "in_progress"], actions: [{ id: "in_progress", label: "Take" }, { id: "resolved", label: "Resolve", input: { key: "reason", label: "Resolution note", optional: true } }] });
  },

  async security() {
    const r = await identityDb.prepare("SELECT action, COUNT(*) c FROM throttle_events WHERE created_at >= ? GROUP BY action ORDER BY c DESC").all(iso(864e5));
    const sms = await safe(() => n(identityDb, "SELECT COUNT(*) AS n FROM sms_events WHERE created_at >= ?", iso(864e5)));
    const sev = await safe(() => n(identityDb, "SELECT COUNT(*) AS n FROM enforcements WHERE action IN ('temp_suspend','perm_suspend','temp_lock') AND created_at >= ?", iso(864e5)));
    return tbl([col("signal", "Throttle bucket (24h)"), col("count", "Events")], r.map((x) => ({ id: x.action, signal: x.action, count: +x.c })),
      { summary: [["Throttled actions (24h)", r.reduce((s, x) => s + +x.c, 0)], ["SMS codes sent (24h)", sms], ["Severe enforcements (24h)", sev], ["2FA", "not implemented"]] });
  },

  async infra() {
    const t = async (db) => { const s = Date.now(); await db.prepare("SELECT 1 AS n").get(); return Date.now() - s; };
    const [li, lc] = await Promise.all([safe(() => t(identityDb), -1), safe(() => t(contentDb), -1)]);
    const env = (k) => (process.env[k] ? "configured" : "missing");
    const rows = [["Identity DB", li >= 0 ? `ok · ${li}ms` : "down"], ["Content DB", lc >= 0 ? `ok · ${lc}ms` : "down"], ["Object storage (B2)", env("B2_KEY_ID")], ["Stripe", env("STRIPE_SECRET_KEY")], ["Email (Resend)", env("RESEND_API_KEY")], ["SMS (Telnyx)", env("TELNYX_API_KEY")], ["LiveKit (Vent audio)", env("LIVEKIT_API_KEY")], ["GIFs (KLIPY)", env("KLIPY_API_KEY")]];
    const m = process.memoryUsage();
    return tbl([col("service", "Service"), col("status", "Status")], rows.map(([s, v]) => ({ id: s, service: s, status: v })),
      { summary: [["Process uptime", Math.round(process.uptime() / 60) + "m"], ["Heap", Math.round(m.heapUsed / 1048576) + " MB"], ["Node", process.version]] });
  },

  async staff() {
    const r = await identityDb.prepare("SELECT id, pseudonym, email, role, last_seen_at FROM accounts WHERE role <> 'user' ORDER BY role, pseudonym").all();
    const roles = ["analyst", "support", "moderator", "trust_safety", "verification_reviewer", "ads_manager", "finance", "legal", "admin", "super_admin"];
    return tbl([col("pseudonym", "Handle"), col("email", "Email"), col("role", "Role"), col("seen", "Last active")],
      r.map((x) => ({ id: x.id, pseudonym: x.pseudonym, email: x.email, role: x.role, seen: x.last_seen_at?.slice(0, 16).replace("T", " ") || "—" })),
      { actions: [{ id: "set_role", label: "Change role", input: { key: "role", label: "New role", options: roles } }, { id: "reset_2fa", label: "Reset 2FA" }, { id: "revoke", label: "Revoke access", danger: true }],
        create: [{ key: "email", label: "Account email" }, { key: "role", label: "Role", options: roles }] });
  },

  async audit() {
    const r = await identityDb.prepare("SELECT l.*, a.pseudonym FROM staff_audit_log l LEFT JOIN accounts a ON a.id = l.actor_id ORDER BY l.created_at DESC LIMIT 300").all();
    return tbl([col("when", "When"), col("actor", "Actor"), col("role", "Role"), col("action", "Action"), col("target", "Target"), col("detail", "Detail")],
      r.map((x) => ({ id: x.id, when: x.created_at.slice(0, 19).replace("T", " "), actor: x.pseudonym || x.actor_id.slice(0, 8), role: x.actor_role, action: x.action, target: x.target ? String(x.target).slice(0, 12) : "", detail: cut(x.detail) })));
  },
};

// ---------------- Row actions ----------------
const setPost = (id, vis, staff, reason) => contentDb.prepare("UPDATE posts SET visibility=?, moderated_by=?, moderated_at=?, mod_reason=? WHERE id=?").run(vis, staff.id, iso(), reason || null, id);
async function enforceViaPost(staff, postId, action, reason) {
  const p = await contentDb.prepare("SELECT anonymous_id FROM posts WHERE id = ?").get(postId);
  const acct = p?.anonymous_id && (await accountIdForAnonymousId(p.anonymous_id));
  if (!acct) throw bad("This post has no linked account (nothing to enforce).");
  await applyEnforcement(staff, acct, action, { reason });
}

export const ACT = {
  async enforcements(staff, id, a, b) {
    if (a !== "revoke") throw bad("Unknown action.");
    const e = await identityDb.prepare("SELECT account_id FROM enforcements WHERE id = ?").get(id);
    if (!e) throw bad("Not found.", 404);
    await applyEnforcement(staff, e.account_id, "restore", { reason: b.reason || "Revoked" });
  },
  async verification(staff, id, a, b) {
    if (a === "document") {
      const r = await identityDb.prepare("SELECT document_path FROM verification_requests WHERE id = ?").get(id);
      if (!r?.document_path) throw bad("No document attached.");
      await logStaff(staff, "view_verification_document", id);
      return { url: await getVerificationDocumentSignedUrl(r.document_path) };
    }
    if (a === "rejected" && !b.reason) throw bad("A reason is required to reject.");
    await reviewVerificationRequest(id, a, staff.pseudonym || staff.id, b.note || b.reason || "");
  },
  async companies(staff, id, a, b) {
    const sql = { verify: "UPDATE companies SET verification='verified', verified_at=? WHERE id=?", reject: "UPDATE companies SET verification='rejected', verification_note=? WHERE id=?",
      suspend: "UPDATE companies SET status='suspended' WHERE id=?", restore: "UPDATE companies SET status='active' WHERE id=?" }[a];
    if (!sql) throw bad("Unknown action.");
    const p = a === "verify" ? [iso(), id] : a === "reject" ? [b.reason || "", id] : [id];
    await contentDb.prepare(sql).run(...p);
    await contentDb.prepare("INSERT INTO company_audit (id, company_id, actor, action, detail, created_at) VALUES (?,?,?,?,?,?)").run(uid(), id, "staff:" + (staff.pseudonym || staff.id), a, b.reason || null, iso());
  },
  async moderation(staff, id, a, b) {
    if (a === "remove") await setPost(id, "removed", staff, b.reason);
    else if (a === "restore") await setPost(id, "public", staff, null);
    else if (a === "warn_author") await enforceViaPost(staff, id, "warning", b.reason);
    else if (a === "limit_author") await enforceViaPost(staff, id, "limit_posting", b.reason);
    else throw bad("Unknown action.");
  },
  async reports(staff, id, a, b) {
    const r = await contentDb.prepare("SELECT * FROM content_reports WHERE id = ?").get(id);
    if (!r) throw bad("Not found.", 404);
    if (a === "action_taken" && r.target_type === "post") await setPost(r.target_id, "removed", staff, b.reason);
    if (a === "action_taken" && r.target_type === "room") await contentDb.prepare("UPDATE rooms SET status='ended', ended_at=? WHERE id=?").run(iso(), r.target_id);
    await contentDb.prepare("UPDATE content_reports SET status=?, resolution=?, handled_by=?, resolved_at=? WHERE id=?").run(a === "dismiss" ? "dismissed" : "actioned", b.reason || null, staff.id, iso(), id);
  },
  async appeals(staff, id, a, b) {
    const ap = await identityDb.prepare("SELECT * FROM appeals WHERE id = ?").get(id);
    if (!ap || ap.status !== "pending") throw bad("Appeal is not pending.");
    if (a === "accepted") await applyEnforcement(staff, ap.account_id, "restore", { reason: `Appeal accepted: ${b.reason}` });
    await identityDb.prepare("UPDATE appeals SET status=?, decided_by=?, decision_note=?, decided_at=? WHERE id=?").run(a, staff.id, b.reason || "", iso(), id);
    const { createNotification } = await import("@/lib/identity/service");
    await createNotification(ap.account_id, "enforcement", a === "accepted" ? "Your appeal was accepted and your account restored." : `Your appeal was reviewed and declined. ${b.reason || ""}`).catch(() => {});
  },
  async spam(staff, id, a, b) {
    if (a !== "remove_all") throw bad("Unknown action.");
    await contentDb.prepare("UPDATE posts SET visibility='removed', moderated_by=?, moderated_at=?, mod_reason=? WHERE md5(text)=? AND created_at >= ?").run(staff.id, iso(), b.reason || "spam", id, iso(864e5));
  },
  async dmca(staff, id, a, b) {
    const d = await identityDb.prepare("SELECT target_post_id FROM dmca_notices WHERE id = ?").get(id);
    if (!d) throw bad("Not found.", 404);
    if (a === "takedown" && d.target_post_id) await setPost(d.target_post_id, "removed", staff, "DMCA takedown");
    await identityDb.prepare("UPDATE dmca_notices SET status=?, handled_by=? WHERE id=?").run(a, staff.id, id);
  },
  async legal(staff, id, a, b) { await identityDb.prepare("UPDATE legal_requests SET status=?, handled_by=?, note=? WHERE id=?").run(a, staff.id, b.reason || null, id); },
  async feed(staff, id, a, b) {
    if (a === "unpin") await contentDb.prepare("UPDATE posts SET pinned=0 WHERE id=?").run(id);
    else if (a === "denominate") await contentDb.prepare("UPDATE posts SET cringe_nominated=0 WHERE id=?").run(id);
    else if (a === "remove") await setPost(id, "removed", staff, b.reason);
    else throw bad("Unknown action.");
  },
  async search(staff, id, a) { if (a === "unblock") await contentDb.prepare("DELETE FROM blocked_terms WHERE term=?").run(id); },
  async dm(staff, id, a) { await contentDb.prepare("UPDATE dm_reports SET status=? WHERE id=?").run(a, id); },
  async rooms(staff, id, a, b) {
    if (a === "delete" || (a === "end" && /delete/i.test(b?.mode || ""))) {
      await contentDb.prepare("DELETE FROM room_participants WHERE room_id=?").run(id);
      await contentDb.prepare("DELETE FROM room_bans WHERE room_id=?").run(id);
      await contentDb.prepare("DELETE FROM content_reports WHERE target_type='room' AND target_id=?").run(id);
      await contentDb.prepare("DELETE FROM rooms WHERE id=?").run(id);
      return;
    }
    const sql = { end: ["UPDATE rooms SET status='ended', ended_at=? WHERE id=?", [iso(), id]], lock: ["UPDATE rooms SET locked=1 WHERE id=?", [id]], unlock: ["UPDATE rooms SET locked=0 WHERE id=?", [id]] }[a];
    if (!sql) throw bad("Unknown action."); await contentDb.prepare(sql[0]).run(...sql[1]);
  },
  async ads(staff, id, a) { await contentDb.prepare("UPDATE ads SET review_status=? WHERE id=?").run(a, +id); },
  async support(staff, id, a) { await identityDb.prepare("UPDATE support_tickets SET status=?, handled_by=? WHERE id=?").run(a, staff.id, id); },
  async staff(staff, id, a, b) {
    if (id === staff.id) throw bad("You can't change your own role.");
    if (a === "reset_2fa") { const { resetTwoFactor } = await import("./twofactor"); await resetTwoFactor(id); return; }
    const role = a === "revoke" ? "user" : b.role;
    await identityDb.prepare("UPDATE accounts SET role=? WHERE id=?").run(role, id);
  },
};

export const CREATE = {
  async feed(staff, b) {
    const p = await contentDb.prepare("SELECT id, visibility FROM posts WHERE id = ?").get((b.post_id || "").trim());
    if (!p) throw bad("No post with that ID."); if (p.visibility === "removed") throw bad("That post was removed.");
    await contentDb.prepare("UPDATE posts SET pinned = 1 WHERE id = ?").run(p.id);
  },
  async dmca(staff, b) { await identityDb.prepare("INSERT INTO dmca_notices (id, claimant, target_post_id, description, created_at) VALUES (?,?,?,?,?)").run(uid(), b.claimant, b.target_post_id || null, b.description || "", iso()); },
  async legal(staff, b) { await identityDb.prepare("INSERT INTO legal_requests (id, agency, type, subject, deadline, created_at) VALUES (?,?,?,?,?,?)").run(uid(), b.agency, b.type, b.subject || "", b.deadline || null, iso()); },
  async search(staff, b) { if (!b.term?.trim()) throw bad("Term required."); await contentDb.prepare("INSERT INTO blocked_terms (term, added_by, created_at) VALUES (?,?,?) ON CONFLICT (term) DO NOTHING").run(b.term.trim().toLowerCase(), staff.pseudonym || staff.id, iso()); },
  async staff(staff, b) {
    const r = await identityDb.prepare("UPDATE accounts SET role=? WHERE lower(email)=lower(?)").run(b.role, b.email);
    if (!r.changes) throw bad("No account with that email.", 404);
  },
};

export async function setPlanForTesting(staff, accountId, tier) {
  if (!["basic", "plus", "pro"].includes(tier)) throw bad("Pick basic, plus or pro.");
  if (!can(staff.role, "gates.bypass")) throw bad("Your role can't change plans.", 403);
  const { setPremiumTier } = await import("@/lib/identity/service");
  await setPremiumTier(accountId, tier);
  await logStaff(staff, "set_plan", accountId, tier);
}

// ---------------- Detail pages ----------------
const kv = (o) => Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => [k, String(v)]);
const ts = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "");

export const DETAIL = {
  async reports(staff, id) {
    const r = await contentDb.prepare("SELECT * FROM content_reports WHERE id = ?").get(id);
    if (!r) throw bad("No such report.", 404);
    const same = await contentDb.prepare("SELECT reason, status, COUNT(*) c FROM content_reports WHERE target_type=? AND target_id=? GROUP BY reason, status").all(r.target_type, r.target_id);
    const blocks = [{ title: "Report", rows: kv({ "Filed": ts(r.created_at), "Reason": r.reason, "Status": r.status, "Handled by": r.handled_by, "Resolved": ts(r.resolved_at), "Resolution": r.resolution }) },
      { title: "All reports on this target", rows: same.map((x) => [`${x.reason} (${x.status})`, String(x.c)]) }];
    let text = null;
    if (r.target_type === "post") {
      const p = await contentDb.prepare("SELECT id, type, title, text, author_display, visibility, created_at, media_path, anonymous_id, mod_reason FROM posts WHERE id = ?").get(r.target_id);
      if (p) {
        text = { title: "Reported post", body: (p.title ? p.title + "\n\n" : "") + p.text };
        const acct = p.anonymous_id && (await accountIdForAnonymousId(p.anonymous_id));
        const prior = acct ? await safe(() => n(identityDb, "SELECT COUNT(*) AS n FROM enforcements WHERE account_id = ?", acct)) : 0;
        const posts = p.anonymous_id ? await safe(() => n(contentDb, "SELECT COUNT(*) AS n FROM posts WHERE anonymous_id = ?", p.anonymous_id)) : 0;
        blocks.push({ title: "Post", rows: kv({ "Author (as displayed)": p.author_display, "Type": p.type, "Posted": ts(p.created_at), "State": p.visibility, "Media": p.media_path ? "attached" : "", "Removal reason": p.mod_reason }) });
        blocks.push({ title: "Author context (identity hidden)", rows: kv({ "Posts by this identity": posts, "Prior enforcements on the account": prior }) });
      } else text = { title: "Reported post", body: "(post no longer exists)" };
    } else blocks.push({ title: "Target", rows: kv({ Type: r.target_type, ID: r.target_id }) });
    if (r.details) text = { ...(text || {}), note: { title: "Reporter's details", body: r.details } };
    return { title: `Report · ${r.reason}`, status: r.status, blocks, text, open: r.status === "open" };
  },
  async appeals(staff, id) {
    const a = await identityDb.prepare("SELECT ap.*, acc.pseudonym, acc.email, acc.status AS acct_status, acc.created_at AS acct_created FROM appeals ap LEFT JOIN accounts acc ON acc.id = ap.account_id WHERE ap.id = ?").get(id);
    if (!a) throw bad("No such appeal.", 404);
    const enf = a.enforcement_id ? await identityDb.prepare("SELECT action, reason, issued_by, expires_at, created_at FROM enforcements WHERE id = ?").get(a.enforcement_id) : null;
    const hist = await identityDb.prepare("SELECT action, reason, created_at, revoked_at FROM enforcements WHERE account_id = ? ORDER BY created_at DESC LIMIT 20").all(a.account_id);
    const prev = await identityDb.prepare("SELECT status, created_at FROM appeals WHERE account_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 10").all(a.account_id, id);
    const pii = can(staff.role, "users.pii");
    await logStaff(staff, "view_appeal", id);
    return { title: `Appeal · ${a.pseudonym || "account"}`, status: a.status, open: a.status === "pending", userId: a.account_id,
      text: { title: "Their appeal", body: a.message },
      blocks: [
        { title: "Appeal", rows: kv({ Filed: ts(a.created_at), Status: a.status, "Decided by": a.decided_by, Decided: ts(a.decided_at), "Decision note": a.decision_note, "Time to decide": a.decided_at ? Math.round((new Date(a.decided_at) - new Date(a.created_at)) / 36e5) + "h" : "" }) },
        { title: "Account", rows: kv({ Handle: a.pseudonym, ...(pii ? { Email: a.email } : {}), "Account status": a.acct_status, "Member since": ts(a.acct_created) }) },
        ...(enf ? [{ title: "Enforcement being appealed", rows: kv({ Action: enf.action, Reason: enf.reason, "Issued by": enf.issued_by, Issued: ts(enf.created_at), Expires: ts(enf.expires_at) }) }] : []),
        { title: "Enforcement history", rows: hist.length ? hist.map((h) => [`${ts(h.created_at)} · ${h.action}${h.revoked_at ? " (revoked)" : ""}`, h.reason]) : [["None", ""]] },
        { title: "Previous appeals", rows: prev.length ? prev.map((p) => [ts(p.created_at), p.status]) : [["None", ""]] },
      ] };
  },
  async dmca(staff, id) {
    const d = await identityDb.prepare("SELECT * FROM dmca_notices WHERE id = ?").get(id);
    if (!d) throw bad("No such notice.", 404);
    return { title: `DMCA · ${d.claimant}`, status: d.status, open: d.status === "open", text: { title: "Description of the work & claim", body: [d.work_description, d.description].filter(Boolean).join("\n\n") || "(none)" },
      blocks: [{ title: "Notice", rows: kv({ Received: ts(d.created_at), Source: d.source, Claimant: d.claimant, Email: d.claimant_email, "Post ID": d.target_post_id, URL: d.target_url, Signature: d.signature, Status: d.status, "Handled by": d.handled_by }) }] };
  },
  async legal(staff, id) {
    const d = await identityDb.prepare("SELECT * FROM legal_requests WHERE id = ?").get(id);
    if (!d) throw bad("No such request.", 404);
    return { title: `Legal · ${d.agency}`, status: d.status, open: d.status === "open", text: { title: "Request details", body: [d.subject, d.details].filter(Boolean).join("\n\n") || "(none)" },
      blocks: [{ title: "Request", rows: kv({ Received: ts(d.created_at), Source: d.source, Agency: d.agency, Type: d.type, "Contact name": d.requester_name, "Contact email": d.requester_email, Reference: d.reference, Deadline: ts(d.deadline), Status: d.status, "Handled by": d.handled_by, Note: d.note }) }] };
  },
};

// Register the larger systems (ads, support, billing, feed controls, DM investigations).
Object.assign(LIST, SYS.LIST); Object.assign(ACT, SYS.ACT); Object.assign(CREATE, SYS.CREATE); Object.assign(DETAIL, SYS.DETAIL);
export { badges, globalSearch, getFeedSettings } from "./systems";
