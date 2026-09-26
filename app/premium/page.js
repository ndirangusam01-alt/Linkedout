"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ShieldOff, ExternalLink, BadgeCheck } from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import { api } from "@/lib/api";

// Three tiers, each with concrete, specific numbers rather than vague
// "Limited" wording — "Unlimited" is reserved for the top tier only, so
// it actually means something when it appears there.
//
// Free and Plus are both $0 — Plus is unlocked by verifying your email
// and phone (see computeTier() below), not by paying. That's a real,
// checkable distinction (account.emailVerified / account.phoneVerified
// already exist), not a marketing label: encourages the verification
// that also earns the "Verified" / "Actually Reachable" badges, which
// happens to be good for trust & safety too. Unlimited is the one real
// paid tier, wired to Stripe (or the sandbox mock upgrade) below.
//
// Note: same as before this redesign, none of these limits are
// server-enforced yet (there's no rate-limit tier logic on the backend
// today) — this is the honest, intended shape of the feature; wiring
// real enforcement per tier is separate follow-up work.
const TIERS = [
  { key: "free", name: "Free", price: "$0", priceNote: "forever" },
  { key: "plus", name: "Plus", price: "$0", priceNote: "verify to unlock" },
  { key: "unlimited", name: "Unlimited", price: "$6", priceNote: "/ month" },
];

const FEATURE_ROWS = [
  { category: "Feed & Posting", label: "Sponsored Roasts in your feed", values: ["Shown", "Fewer shown", "None"] },
  { category: "Feed & Posting", label: "Anonymous posts per day", values: ["3 / day", "10 / day", "Unlimited"] },
  { category: "Company Intel", label: "Salary data on company pages", values: ["Preview only", "Preview only", "Fully unlocked"] },
  { category: "AI Tools", label: "Humble Brag Translator", values: ["3 / day", "10 / day", "Unlimited"] },
  { category: "AI Tools", label: "Resume Roast AI", values: ["1 total", "3 total", "Unlimited"] },
  { category: "Community", label: "AMA / Q&A placement", values: ["Standard", "Standard", "Priority"] },
  { category: "Community", label: "Cringe Awards voting", values: ["Standard access", "Standard access", "Early access"] },
];

function computeTier(user) {
  if (!user) return "free";
  if (user.isPremium) return "unlimited";
  if (user.emailVerified && user.phoneVerified) return "plus";
  return "free";
}

export default function PremiumPage() {
  const { user, loading, refresh } = useAuth();
  const [stripeConfigured, setStripeConfigured] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getStripeStatus().then((s) => setStripeConfigured(s.configured)).catch(() => setStripeConfigured(false));
  }, []);

  const currentTier = computeTier(user);

  async function upgradeViaStripe() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.createCheckoutSession();
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function openBillingPortal() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.createPortalSession();
      window.location.href = url;
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  async function mockUpgrade() {
    setBusy(true);
    setError(null);
    try {
      await api.upgradeToPremium();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function mockDowngrade() {
    setBusy(true);
    setError(null);
    try {
      await api.downgradeFromPremium();
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function TierCard({ tier }) {
    const isCurrent = currentTier === tier.key;
    const isUnlimited = tier.key === "unlimited";
    return (
      <div
        style={{
          background: isUnlimited ? `linear-gradient(150deg, ${alpha(C.mustard, 14)}, ${C.surface})` : C.surface,
          border: `1px solid ${isUnlimited ? alpha(C.mustard, 45) : C.line}`,
          borderRadius: 12,
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          position: "relative",
        }}
      >
        {isCurrent && (
          <div style={{ position: "absolute", top: 12, right: 12, ...monoFont, fontSize: 9.5, color: isUnlimited ? C.mustard : C.muted, border: `1px solid ${isUnlimited ? alpha(C.mustard, 45) : C.line}`, borderRadius: 20, padding: "2px 8px" }}>
            YOUR PLAN
          </div>
        )}
        <div style={{ ...monoFont, fontSize: 11, color: isUnlimited ? C.mustard : C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {tier.name}
        </div>
        <div style={{ ...displayFont, fontSize: 24, fontWeight: 800, color: C.text }}>
          {tier.price}
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}> {tier.priceNote}</span>
        </div>
        {tier.key === "plus" && (
          <div className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
            <BadgeCheck size={12} /> Verify your email + phone in Settings to unlock — no payment needed.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
          {FEATURE_ROWS.map((row, i) => {
            const idx = TIERS.findIndex((t) => t.key === tier.key);
            const value = row.values[idx];
            const isBestValue = value === "Unlimited" || value === "None" || value === "Priority" || value === "Early access" || value === "Fully unlocked";
            return (
              <div key={row.label} className="flex items-start justify-between gap-2">
                <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{row.label}</span>
                <span className="flex items-center gap-1 shrink-0" style={{ ...monoFont, fontSize: 11, color: isBestValue ? C.mustard : C.text, fontWeight: isBestValue ? 700 : 500 }}>
                  {isBestValue && <Check size={10} />} {value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.mustard, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <Sparkles size={13} /> Plans
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, maxWidth: 520 }}>
          {stripeConfigured === true && "Unlimited is billed securely via Stripe — cancel any time from the billing portal below. Plus is free: just verify your email and phone."}
          {stripeConfigured === false && "Sandbox billing on this deployment — toggling Unlimited below won't charge a card. Plus is free either way: just verify your email and phone."}
        </p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {TIERS.map((tier) => <TierCard key={tier.key} tier={tier} />)}
      </div>

      {error && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{error}</div>}

      {loading || stripeConfigured === null ? (
        <div className="lo-skeleton" style={{ height: 44 }} />
      ) : !user ? (
        <Link
          href="/login"
          className="lo-tap"
          style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "12px 16px", fontWeight: 700, textAlign: "center", textDecoration: "none" }}
        >Log in to upgrade</Link>
      ) : user.isPremium ? (
        <div className="flex flex-col gap-2 items-start">
          <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 12, color: C.mustard }}>
            <Sparkles size={14} /> You're on Unlimited — ads are off.
          </div>
          {stripeConfigured ? (
            <button
              onClick={openBillingPortal}
              disabled={busy}
              className="flex items-center gap-1.5"
              style={{ ...monoFont, fontSize: 11, color: C.text, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 12px" }}
            >{busy ? <ExternalLink size={12} className="lo-spin" /> : <ExternalLink size={12} />} {busy ? "opening…" : "Manage billing"}</button>
          ) : (
            <button
              onClick={mockDowngrade}
              disabled={busy}
              className="flex items-center gap-1.5"
              style={{ ...monoFont, fontSize: 11, color: C.muted, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 12px" }}
            ><ShieldOff size={12} /> {busy ? "working…" : "Switch back to Free (sandbox)"}</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 items-start">
          {currentTier === "free" && (
            <Link
              href="/settings"
              className="flex items-center gap-1.5 lo-tap"
              style={{ ...monoFont, fontSize: 11.5, color: C.text, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 14px", textDecoration: "none" }}
            ><BadgeCheck size={13} /> Verify email + phone for Plus (free)</Link>
          )}
          {stripeConfigured ? (
            <button
              onClick={upgradeViaStripe}
              disabled={busy}
              className="flex items-center justify-center gap-2"
              style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "12px 16px", fontWeight: 700, border: "none" }}
            >{busy && <Sparkles size={13} className="lo-spin" />} {busy ? "redirecting…" : "Upgrade to Unlimited"}</button>
          ) : (
            <button
              onClick={mockUpgrade}
              disabled={busy}
              className="flex items-center justify-center gap-2"
              style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "12px 16px", fontWeight: 700, border: "none" }}
            >{busy && <Sparkles size={13} className="lo-spin" />} {busy ? "upgrading…" : "Upgrade to Unlimited (sandbox)"}</button>
          )}
        </div>
      )}
    </div>
  );
}
