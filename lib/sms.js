// SMS via Twilio, for optional phone verification. Same pattern as
// lib/email.js and lib/stripe.js: lazy client, logs instead of sending
// when unconfigured, so the verification flow works end to end in local
// dev without a real Twilio account.
import twilio from "twilio";

let _client = null;

function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  _client = twilio(sid, token);
  return _client;
}

export function isSmsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendVerificationSms(toPhone, code) {
  const client = getClient();
  if (!client || !process.env.TWILIO_FROM_NUMBER) {
    console.log(`[sms:not-configured] would send code ${code} to ${toPhone}`);
    return { sent: false, reason: "TWILIO_NOT_CONFIGURED" };
  }
  try {
    await client.messages.create({
      to: toPhone,
      from: process.env.TWILIO_FROM_NUMBER,
      body: `Your LinkedOut verification code is ${code}. It expires in 10 minutes.`,
    });
    return { sent: true };
  } catch (e) {
    console.error("[sms] failed to send verification code:", e.message);
    return { sent: false, reason: e.message };
  }
}
