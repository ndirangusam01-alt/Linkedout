// Transactional email via Resend. Same pattern as lib/stripe.js: lazy
// client construction so a missing RESEND_API_KEY doesn't break the build
// or crash a route — it just logs instead of sending, so signup/reset
// flows keep working end to end during local dev without real credentials.
import { Resend } from "resend";
import { getAppUrl } from "./config.js";
import { NOTIFICATION_CATEGORIES, categoryForType } from "./identity/notification-categories.js";

let _resend = null;

function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function getFromAddress() {
  return process.env.RESEND_FROM_EMAIL || "LinkedOut <onboarding@resend.dev>";
}

async function send({ to, subject, html, text, logLabel }) {
  const resend = getResend();
  if (!resend) {
    // Not configured — log what *would* have been sent so local dev and
    // testing aren't blocked on having real Resend credentials. This is
    // the same honesty pattern as Stripe: never silently pretend an email
    // went out.
    console.log(`[email:not-configured] would send "${logLabel}" to ${to}`);
    return { sent: false, reason: "RESEND_NOT_CONFIGURED" };
  }
  try {
    await resend.emails.send({ from: getFromAddress(), to, subject, html, text });
    return { sent: true };
  } catch (e) {
    console.error(`[email] failed to send "${logLabel}" to ${to}:`, e.message);
    return { sent: false, reason: e.message };
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------
// Shared branded layout. Table-based and inline-styled throughout —
// not because it's 2003, but because that's still what actually renders
// consistently across Outlook/Gmail/Apple Mail. A light card design
// (not the app's own dark theme) is deliberate: dark-mode HTML email
// support is inconsistent across clients, and a white card with a navy
// accent bar reads as more "production-grade transactional email" than
// trying to force the in-app dark palette into an inbox.
// ---------------------------------------------------------------
const BRAND = {
  navy: "#0C1423",
  blue: "#4C61FF",
  text: "#1A2233",
  muted: "#6B7280",
  border: "#E5E8EF",
  bg: "#F4F6FB",
};

function button(label, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;"><tr><td style="border-radius: 8px; background: ${BRAND.blue};">
    <a href="${href}" style="display: inline-block; padding: 12px 24px; font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 700; color: #FFFFFF; text-decoration: none; border-radius: 8px;">${label}</a>
  </td></tr></table>`;
}

function layout({ preheader = "", body, footerNote = "" }) {
  const logoUrl = `${getAppUrl()}/logo-mark.png`;
  const prefsLink = `${getAppUrl()}/settings#notifications`;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LinkedOut</title>
</head>
<body style="margin: 0; padding: 0; background: ${BRAND.bg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">
  <div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.bg}; padding: 32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width: 480px; background: #FFFFFF; border-radius: 14px; overflow: hidden; border: 1px solid ${BRAND.border};" cellpadding="0" cellspacing="0">
        <tr><td style="background: ${BRAND.navy}; padding: 22px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align: middle;"><img src="${logoUrl}" width="26" height="26" alt="" style="display: block;" /></td>
            <td style="vertical-align: middle; padding-left: 8px; font-size: 16px; font-weight: 800; color: #FFFFFF;">Linked<span style="color: ${BRAND.blue};">Out</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding: 32px 28px; color: ${BRAND.text}; font-size: 14px; line-height: 1.6;">
          ${body}
        </td></tr>
        <tr><td style="padding: 20px 28px; background: ${BRAND.bg}; border-top: 1px solid ${BRAND.border};">
          <p style="margin: 0 0 6px; font-size: 11.5px; color: ${BRAND.muted};">${footerNote}</p>
          <p style="margin: 0; font-size: 11.5px; color: ${BRAND.muted};">
            <a href="${prefsLink}" style="color: ${BRAND.muted}; text-decoration: underline;">Manage notification preferences</a>
            &nbsp;·&nbsp; LinkedOut — the blooper reel to LinkedIn's highlight reel
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function sendWelcomeEmail(to, realName) {
  const body = `
    <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700;">Welcome, ${escapeHtml(realName)}.</p>
    <p style="margin: 0 0 16px; color: ${BRAND.muted};">Welcome to LinkedOut — the blooper reel to LinkedIn's highlight reel.</p>
    <p style="margin: 0 0 8px;">Post honestly, react freely, and visit Settings any time to change your pseudonym, avatar, or identity preferences.</p>
    ${button("Open LinkedOut", getAppUrl())}
  `;
  return send({
    to, subject: "Welcome to LinkedOut", logLabel: "welcome",
    html: layout({ preheader: "Welcome to LinkedOut", body, footerNote: "You're receiving this because you just created a LinkedOut account." }),
    text: `Welcome to LinkedOut, ${realName}. Open the app: ${getAppUrl()}`,
  });
}

export function sendVerificationEmail(to, token) {
  const link = `${getAppUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700;">Confirm your email</p>
    <p style="margin: 0 0 16px; color: ${BRAND.muted};">One click to verify this is really your email address.</p>
    ${button("Verify email address", link)}
    <p style="margin: 16px 0 0; font-size: 12px; color: ${BRAND.muted};">This link expires in 24 hours. If you didn't sign up for LinkedOut, you can safely ignore this email.</p>
  `;
  return send({
    to, subject: "Verify your LinkedOut email", logLabel: "email verification",
    html: layout({ preheader: "Confirm your email address", body, footerNote: "You're receiving this because this email was used to sign up for LinkedOut." }),
    text: `Verify your email: ${link}`,
  });
}

export function sendPasswordResetEmail(to, token) {
  const link = `${getAppUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const body = `
    <p style="margin: 0 0 4px; font-size: 18px; font-weight: 700;">Reset your password</p>
    <p style="margin: 0 0 16px; color: ${BRAND.muted};">Someone requested a password reset for this account.</p>
    ${button("Choose a new password", link)}
    <p style="margin: 16px 0 0; font-size: 12px; color: ${BRAND.muted};">This link expires in 1 hour. If this wasn't you, ignore this email — your password won't change unless you click the link and choose a new one.</p>
  `;
  return send({
    to, subject: "Reset your LinkedOut password", logLabel: "password reset",
    html: layout({ preheader: "Reset your password", body, footerNote: "You're receiving this because a password reset was requested for this account." }),
    text: `Reset your password: ${link}`,
  });
}

const NOTIFICATION_SUBJECTS = {
  reaction: "Someone reacted to your post",
  comment: "New comment on your post",
  repost: "Someone reposted your post",
  poll_vote: "New activity on your poll",
  mention: "You were mentioned in a post",
  follow: "You have a new follower",
  room_joined: "Someone joined your Vent Room",
  room_promoted: "You can speak in the room now",
  room_muted: "Your mic was muted",
  badge: "You earned a new badge",
  verification: "Update on your verification request",
  security: "Security alert for your account",
};

// Fired from createNotification() in lib/identity/service.js, which has
// already checked this category's email preference before calling here —
// this function itself doesn't re-check preferences, it just sends.
export function sendNotificationEmail(to, type, message, relatedPostId) {
  const link = relatedPostId ? `${getAppUrl()}/post/${relatedPostId}` : `${getAppUrl()}/profile`;
  const category = categoryForType(type);
  const categoryLabel = NOTIFICATION_CATEGORIES[category]?.label || "Notifications";
  const body = `
    <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: ${BRAND.blue};">${escapeHtml(categoryLabel)}</p>
    <p style="margin: 0 0 16px; font-size: 15px;">${escapeHtml(message)}</p>
    ${button("View on LinkedOut", link)}
  `;
  return send({
    to,
    subject: NOTIFICATION_SUBJECTS[type] || "New LinkedOut notification",
    logLabel: `notification:${type}`,
    html: layout({ preheader: message, body, footerNote: `You're receiving this because your "${categoryLabel}" email notifications are on.` }),
    text: `${message}\n${link}`,
  });
}
