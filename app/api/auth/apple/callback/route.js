import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeAppleCode } from "@/lib/oauth";
import { findOrCreateAppleAccount } from "@/lib/identity/service";
import { createSessionCookie } from "@/lib/session";
import { getAppUrl } from "@/lib/config";

// Apple's response_mode=form_post means the browser POSTs here (not a
// GET with query params, like Google) — the code/state arrive as form
// fields in the request body.
export async function POST(request) {
  const appUrl = getAppUrl();
  const form = await request.formData().catch(() => null);
  const code = form?.get("code");
  const state = form?.get("state");
  // Apple sends a `user` field with name/email, but ONLY on the very
  // first authorization ever for a given user+app — subsequent logins
  // won't include it, which is why exchangeAppleCode()'s realName can be
  // null and callers need to handle that.
  const userJson = form?.get("user");

  const store = await cookies();
  const expectedState = store.get("lo_oauth_state")?.value;
  store.delete("lo_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${appUrl}/login?error=oauth_state_mismatch`);
  }

  try {
    const { appleId, email, realName } = await exchangeAppleCode(code);
    let resolvedName = realName;
    if (!resolvedName && userJson) {
      try {
        const parsed = JSON.parse(userJson);
        resolvedName = [parsed?.name?.firstName, parsed?.name?.lastName].filter(Boolean).join(" ") || null;
      } catch {
        // ignore malformed `user` field
      }
    }
    const account = await findOrCreateAppleAccount({ appleId, email, realName: resolvedName || email });
    await createSessionCookie(account.id);
    return NextResponse.redirect(`${appUrl}/profile`);
  } catch (e) {
    console.error("Apple OAuth callback failed:", e.message);
    return NextResponse.redirect(`${appUrl}/login?error=oauth_failed`);
  }
}
