import { NextResponse } from "next/server";
import { createAccount, signSession, createEmailVerificationToken } from "@/lib/identity/service";
import { createSessionCookie } from "@/lib/session";
import { sendWelcomeEmail, sendVerificationEmail } from "@/lib/email";

const PSEUDONYM_RE = /^[a-zA-Z0-9_]{3,24}$/;

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const password = body?.password;
  const realName = body?.realName?.trim();
  const pseudonym = body?.pseudonym?.trim();
  const country = body?.country?.trim() || null;
  const accountType = body?.accountType === "business" ? "business" : "personal";
  const interests = Array.isArray(body?.interests) ? body.interests : [];

  if (!email || !password || !realName || !pseudonym) {
    return NextResponse.json({ error: "Email, password, real name, and pseudonym are all required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password needs to be at least 8 characters." }, { status: 400 });
  }
  if (!PSEUDONYM_RE.test(pseudonym)) {
    return NextResponse.json({ error: "Pseudonym must be 3-24 characters: letters, numbers, and underscores only." }, { status: 400 });
  }

  try {
    const account = await createAccount({ email, password, realName, pseudonym, country, accountType, interests });

    // Web: httpOnly cookie, sent automatically. Native app: no cookie jar
    // to rely on, so it also gets the raw token in the body and stores it
    // itself (expo-secure-store), sending it back as `Authorization:
    // Bearer <token>`. Same signed token either way — see lib/session.js.
    await createSessionCookie(account.id);
    const token = await signSession(account.id);

    // Fire-and-forget in spirit, but awaited so a delivery failure shows
    // up in logs rather than vanishing — neither email blocks signup from
    // succeeding (see lib/email.js's graceful no-op when unconfigured).
    await sendWelcomeEmail(account.email, account.realName);
    const verificationToken = await createEmailVerificationToken(account.id);
    await sendVerificationEmail(account.email, verificationToken);

    return NextResponse.json(
      { email: account.email, realName: account.realName, pseudonym: account.pseudonym, token },
      { status: 201 }
    );
  } catch (e) {
    if (e.code === "EMAIL_TAKEN" || e.code === "PSEUDONYM_TAKEN") {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("Signup failed:", e);
    return NextResponse.json({ error: "Could not create account." }, { status: 500 });
  }
}
