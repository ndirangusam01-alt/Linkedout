import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeGoogleCode } from "@/lib/oauth";
import { findOrCreateGoogleAccount, signSession } from "@/lib/identity/service";
import { createSessionCookie } from "@/lib/session";
import { getAppUrl } from "@/lib/config";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = getAppUrl();

  const store = await cookies();
  const expectedState = store.get("lo_oauth_state")?.value;
  store.delete("lo_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state_mismatch`);
  }

  try {
    const { googleId, email, realName } = await exchangeGoogleCode(code);
    const account = await findOrCreateGoogleAccount({ googleId, email, realName });
    await createSessionCookie(account.id);
    // Native app note: this flow is web-only (Google redirects to a
    // browser URL). The native app would use expo-auth-session, which
    // opens the same Google consent screen in an in-app browser and gets
    // the resulting token back into the app directly — not implemented
    // in linkedout-native yet; see its README.
    return NextResponse.redirect(`${appUrl}/profile`);
  } catch (e) {
    console.error("Google OAuth callback failed:", e.message);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
  }
}
