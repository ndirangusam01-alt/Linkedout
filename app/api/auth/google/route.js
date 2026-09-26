import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { isGoogleConfigured, buildGoogleAuthUrl } from "@/lib/oauth";

// Starts the Google OAuth flow. A short-lived state value is stored in a
// cookie and checked again in the callback, as basic CSRF protection for
// the redirect round-trip.
export async function GET() {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: "Google sign-in isn't configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local.", code: "GOOGLE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("lo_oauth_state", state, { httpOnly: true, maxAge: 600, path: "/", sameSite: "lax" });
  return NextResponse.redirect(buildGoogleAuthUrl(state));
}
