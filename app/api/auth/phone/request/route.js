import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { requestPhoneVerification } from "@/lib/identity/service";
import { sendVerificationSms } from "@/lib/sms";

export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const phone = body?.phone?.trim();
  if (!phone) return NextResponse.json({ error: "Phone number is required." }, { status: 400 });

  const code = await requestPhoneVerification(accountId, phone);
  const result = await sendVerificationSms(phone, code);
  return NextResponse.json({ ok: true, smsSent: result.sent });
}
