import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { identityDb } from "@/lib/identity/db";
import { can, isStaffRole } from "./roles";
import { twoFactorState } from "./twofactor";

// Every admin API call goes through here. The role is ALWAYS re-read from
// the database — never trusted from the client or the token — so revoking
// a role takes effect on the very next request, web or native.
export async function getStaff() {
  const id = await getCurrentAccountId();
  if (!id) return null;
  const row = await identityDb.prepare("SELECT id, role, pseudonym, email FROM accounts WHERE id = ?").get(id);
  if (!row || !isStaffRole(row.role)) return null;
  return { id: row.id, role: row.role, pseudonym: row.pseudonym, email: row.email };
}

export async function requireStaff(perm) {
  const staff = await getStaff();
  if (!staff) return { error: NextResponse.json({ error: "Staff access required." }, { status: 403 }) };
  const tf = await twoFactorState(staff.id);
  if (!tf.verified) return { error: NextResponse.json({ error: tf.enabled ? "Enter your 2FA code." : "Set up two-factor authentication to continue.", code: tf.enabled ? "2FA_REQUIRED" : "2FA_SETUP_REQUIRED" }, { status: 403 }) };
  if (perm && !can(staff.role, perm)) return { error: NextResponse.json({ error: "Your role doesn't permit this." }, { status: 403 }) };
  return { staff };
}
