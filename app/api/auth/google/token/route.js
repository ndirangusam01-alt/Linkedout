import { NextResponse } from "next/server";
import { verifyGoogleIdToken } from "@/lib/oauth";
import { findOrCreateGoogleAccount, signSession } from "@/lib/identity/service";

// Native counterpart to /api/auth/google/callback. The mobile app (see
// linkedout-native's context/AuthContext.js) gets a Google id_token
// directly via expo-auth-session's in-app-browser flow, then POSTs it
// here instead of following a server-side redirect — there's no
// meaningful "redirect back to the app" on native the way there is on
// web, so the token exchange happens over a normal API call and the
// client stores the resulting session token itself, exactly like
// email/password signup already does.
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const idToken = body?.idToken;
  if (!idToken) return NextResponse.json({ error: "Missing idToken." }, { status: 400 });

  try {
    const { googleId, email, realName } = await verifyGoogleIdToken(idToken);
    const account = await findOrCreateGoogleAccount({ googleId, email, realName });
    const token = await signSession(account.id);
    return NextResponse.json({
      token,
      email: account.email,
      realName: account.realName,
      pseudonym: account.pseudonym,
    });
  } catch (e) {
    console.error("Google native token verification failed:", e.message);
    return NextResponse.json({ error: "Could not verify Google sign-in." }, { status: 401 });
  }
}
