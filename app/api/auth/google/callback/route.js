import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isStaffRole } from "@/lib/admin/roles";
import { getAccountById, findOrCreateGoogleAccount } from "@/lib/identity/service";
import { exchangeGoogleCode } from "@/lib/oauth";
import { createSessionCookie } from "@/lib/session";
import { getAppUrl } from "@/lib/config";
import { verifyToken } from "@/lib/identity/crypto";
import { challengeIfNeeded } from "@/lib/identity/mfa";
import { makeExchangeTicket } from "@/lib/identity/native-ticket";
import { appReturnResponse } from "@/lib/identity/app-return";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = getAppUrl();

  const store = await cookies();
  const expectedState = store.get("lo_oauth_state")?.value;
  store.delete("lo_oauth_state");

  // A state that decodes to { r } came from the native app: finish by redirecting
  // to its return URL instead of setting a website cookie.
  const native = state && verifyToken(state);
  const ret = native?.r;
  const back = (q) => `${ret}${ret.includes("?") ? "&" : "?"}${q}`;

  if (!code || !state || state !== expectedState) {
    return ret ? appReturnResponse(back("error=oauth_failed"), { failed: true }) : NextResponse.redirect(`${appUrl}/login?error=oauth_state_mismatch`);
  }
  try {
    const { googleId, email, realName } = await exchangeGoogleCode(code);
    const account = await findOrCreateGoogleAccount({ googleId, email, realName });
    if (ret) return appReturnResponse(back(`code=${encodeURIComponent(makeExchangeTicket(account.id))}`));
    const mfa = await challengeIfNeeded(account.id);
    if (mfa) return NextResponse.redirect(`${appUrl}/login?mfa=${encodeURIComponent(mfa)}`);
    await createSessionCookie(account.id);
    return NextResponse.redirect(`${appUrl}${isStaffRole((await getAccountById(account.id))?.role) ? "/admin" : "/profile"}`);
  } catch (e) {
    console.error("Google OAuth callback failed:", e.message);
    return ret ? appReturnResponse(back("error=oauth_failed"), { failed: true }) : NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
  }
}
