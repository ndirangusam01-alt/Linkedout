import { NextResponse } from "next/server";
import { getStaff, requireStaff } from "@/lib/admin/guard";
import { SECTIONS, permissionsFor, sectionsFor, can, ENFORCEMENT_ACTIONS } from "@/lib/admin/roles";
import { overview, listUsers, userDetail, LIST, ACT, CREATE, DETAIL, setPlanForTesting, badges, globalSearch } from "@/lib/admin/service";
import { applyEnforcement, logStaff } from "@/lib/admin/enforce";
import { twoFactorState, beginSetup, confirmSetup, verifyLogin } from "@/lib/admin/twofactor";
import { throttle } from "@/lib/identity/throttle-http";

// One dispatcher for the whole admin API (web + native share it):
//   GET  me                         who am I, 2FA state, and (once 2FA-verified) allowed sections
//   POST 2fa/setup | 2fa/confirm | 2fa/verify
//   GET  overview | users[/:id] | <section> | <section>/:id (detail pages)
//   POST users/:id/enforce | users/:id/plan | <section>/create | <section>/:rowId/:action
// Every call below `me` and `2fa/*` requires a verified second factor.

const EXTRA_PERM = { "enforcements.revoke": "users.enforce.severe", "appeals.accepted": "appeals.handle", "appeals.rejected": "appeals.handle", "payments.set_plan": "payments.manage", "payments.cancel_sub": "payments.manage", "payments.refund": "payments.manage" };
// Expected failures (validation, permission) carry a status and a safe message; anything else
// is logged server-side and the caller only sees a generic line — never SQL, paths or stack traces.
const fail = (e) => {
  if (e?.status && e.status < 500) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("Admin API error:", e);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
};
const DONE = new Set(["approved", "rejected", "accepted", "actioned", "dismissed", "resolved", "complied", "contested", "takedown", "revoked"]);

function withToken(res, token) {
  res.cookies.set("lo_2fa", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 12 * 3600 });
  return res;
}

export async function GET(request, { params }) {
  const [a, b] = (await params).path;
  if (a === "me") {
    const staff = await getStaff();
    if (!staff) return NextResponse.json({ staff: false });
    const tf = await twoFactorState(staff.id);
    const base = { staff: true, role: staff.role, pseudonym: staff.pseudonym, twoFactor: tf };
    if (!tf.verified) return NextResponse.json(base);
    return NextResponse.json({ ...base, permissions: permissionsFor(staff.role), sections: sectionsFor(staff.role), enforcementActions: ENFORCEMENT_ACTIONS });
  }
  if (a === "badges" || a === "search") {
    const { staff, error } = await requireStaff();
    if (error) return error;
    try { return NextResponse.json(a === "badges" ? await badges() : { hits: await globalSearch(staff, new URL(request.url).searchParams.get("q")) }); } catch (e) { return fail(e); }
  }
  const sec = SECTIONS.find((s) => s.id === a);
  if (!sec) return NextResponse.json({ error: "Unknown section." }, { status: 404 });
  const { staff, error } = await requireStaff(sec.perm);
  if (error) return error;
  try {
    const url = new URL(request.url);
    const query = Object.fromEntries(url.searchParams);
    if (a === "overview") return NextResponse.json(await overview());
    if (a === "users") {
      if (b) return NextResponse.json(await userDetail(staff, b));
      return NextResponse.json({ users: await listUsers(staff, { q: url.searchParams.get("q") || "", status: url.searchParams.get("status") || "" }), canPII: can(staff.role, "users.pii") });
    }
    const actionsFor = (data) => (data.actions || []).filter((x) => !(EXTRA_PERM[`${a}.${x.id}`] && !can(staff.role, EXTRA_PERM[`${a}.${x.id}`])) && !(a === "staff" && staff.role !== "super_admin"));
    if (b && DETAIL[a]) {
      const d = await DETAIL[a](staff, b, query);
      d.section = a;
      if (d.noActions) { d.actions = []; return NextResponse.json(d); }
      const list = await LIST[a](staff);
      d.actions = actionsFor(list).filter((x) => !(list.pendingOnly?.includes(x.id) && !d.open));
      if (a === "support") d.actions = [
        { id: "reply", label: "Reply to user", input: { key: "body", label: "Your reply (the user is notified)" } },
        { id: "note", label: "Internal note", input: { key: "body", label: "Private note — never shown to the user" } },
        { id: "take", label: "Take" },
        { id: "priority", label: "Priority", input: { key: "value", label: "Priority", options: ["low", "normal", "high", "urgent"] } },
        { id: "status", label: "Status", input: { key: "value", label: "Status", options: ["open", "pending", "resolved", "closed"] } },
      ];
      return NextResponse.json(d);
    }
    const data = await LIST[a](staff, query);
    if (data.actions) data.actions = actionsFor(data);
    return NextResponse.json(data);
  } catch (e) { return fail(e); }
}

export async function POST(request, { params }) {
  const [a, b, c] = (await params).path;
  const body = await request.json().catch(() => ({}));

  // ---- Two-factor: reachable by staff before they've passed it ----
  if (a === "2fa") {
    const staff = await getStaff();
    if (!staff) return NextResponse.json({ error: "Staff access required." }, { status: 403 });
    try {
      if (b === "setup") {
        if ((await twoFactorState(staff.id)).enabled) return NextResponse.json({ error: "2FA is already on. Ask a super admin to reset it." }, { status: 400 });
        return NextResponse.json(await beginSetup(staff));
      }
      if (b === "confirm") { const r = await confirmSetup(staff, body.code); await logStaff(staff, "2fa_enabled"); return withToken(NextResponse.json({ ok: true, recoveryCodes: r.recoveryCodes, token: r.token }), r.token); }
      if (b === "verify") {
        const limited = await throttle(request, [["email", staff.id, "admin_2fa", { max: 8, windowMs: 15 * 60 * 1000, label: "2FA attempts" }]]);
        if (limited) return limited;
        const token = await verifyLogin(staff, body.code); await logStaff(staff, "2fa_login");
        return withToken(NextResponse.json({ ok: true, token }), token);
      }
    } catch (e) { return fail(e); }
    return NextResponse.json({ error: "Unknown 2FA step." }, { status: 404 });
  }

  const sec = SECTIONS.find((s) => s.id === a);
  if (!sec) return NextResponse.json({ error: "Unknown section." }, { status: 404 });
  const { staff, error } = await requireStaff(sec.perm);
  if (error) return error;
  try {
    if (a === "users" && c === "enforce") {
      if (!can(staff.role, "users.enforce")) return NextResponse.json({ error: "Your role can't enforce." }, { status: 403 });
      const r = await applyEnforcement(staff, b, body.action, { reason: body.reason || "", days: body.days, privilege: body.privilege });
      return NextResponse.json({ ok: true, ...r });
    }
    if (a === "users" && c === "plan") { await setPlanForTesting(staff, b, body.tier); return NextResponse.json({ ok: true }); }
    if (b === "create") {
      if (!CREATE[a]) return NextResponse.json({ error: "Not supported." }, { status: 400 });
      if (a === "staff" && staff.role !== "super_admin") return NextResponse.json({ error: "Only a super admin manages staff." }, { status: 403 });
      await CREATE[a](staff, body); await logStaff(staff, `create:${a}`, null, JSON.stringify(Object.keys(body)));
      return NextResponse.json({ ok: true });
    }
    const need = EXTRA_PERM[`${a}.${c}`];
    if (need && !can(staff.role, need)) return NextResponse.json({ error: "Your role doesn't permit this action." }, { status: 403 });
    if (a === "staff" && staff.role !== "super_admin") return NextResponse.json({ error: "Only a super admin manages staff." }, { status: 403 });
    if (!ACT[a]) return NextResponse.json({ error: "Not supported." }, { status: 400 });
    const out = await ACT[a](staff, b, c, body);
    if (c !== "document") await logStaff(staff, `${a}:${c}`, b, body.reason || body.note || body.role || null);
    return NextResponse.json({ ok: true, ...(out || {}) });
  } catch (e) { return fail(e); }
}
