"use client";
import ErrorNote from "@/components/ErrorNote";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Minus, Sparkles, ExternalLink, BadgeCheck, CircleDashed, Crown, Zap, Leaf } from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import { api } from "@/lib/api";
import { PLANS } from "@/lib/tiers";

// Only real, server- or client-enforced perks are listed here — nothing
// aspirational. Enforcement lives in: lib/identity/rate-limit.js
// (TIERED_DAILY_LIMITS: translator + resume roast), lib/tiers.js (Vent
// Room join/start), and app/page.js (ads hidden for any paid tier).
//
// DISPLAY prices come from PLANS in lib/tiers.js. The amount actually charged
// is whatever the Stripe Prices behind STRIPE_PLUS_PRICE_ID / _ANNUAL_PRICE_ID
// (and PRO) are set to — keep them in sync.
// Rows marked "Soon" are planned but NOT yet enforced; they are labelled so.
const TIERS = [
  { key: "basic", name: "OUT", tagline: "Speak", icon: Leaf, blurb: "Read every story, share your own, see company patterns. Free, always." },
  { key: "plus", name: "OUT+", tagline: "Understand", icon: Zap, blurb: "Story assistant, identity-risk checks, summaries and scheduling. Ad-free." },
  { key: "pro", name: "OUT PRO", tagline: "Investigate", icon: Crown, blurb: "Company deep dives, Pattern Explorer and the highest AI limits." },
];

const SECTIONS = [
  {
    title: "Stories (free for everyone to read and tell)",
    rows: [
      { label: "Read all stories and company patterns", values: [true, true, true] },
      { label: "Share Stories, anonymously if you like", values: [true, true, true] },
      { label: "“This happened to me too” and story updates", values: [true, true, true] },
      { label: "Automatic redaction of emails, phones, IDs", values: [true, true, true] },
      { label: "Private drafts", values: [true, true, true] },
      { label: "Track stories", values: ["Up to 5", "Unlimited", "Unlimited"] },
      { label: "Identity-risk warnings", values: [false, true, true] },
      { label: "AI Story Assistant", values: [false, "10 / day", "50 / day"] },
      { label: "Scheduled publishing", values: [false, true, true] },
    ],
  },
  {
    title: "Understand (company and market insight)",
    rows: [
      { label: "AI “what people are saying” summaries", values: [false, "15 / day", "60 / day"] },
      { label: "Reality Translator, glossary", values: [true, true, true] },
      { label: "Reality Translator, AI for any text", values: [false, "20 / day", "100 / day"] },
      { label: "Company Deep Dive", values: [false, false, "30 / day"] },
      { label: "Pattern Explorer (ask questions of the stories)", values: [false, false, "30 / day"] },
      { label: "Saved searches and alerts", values: [false, "5", "25"] },
      { label: "Start a Support Circle", values: [false, "1 circle", "Up to 5, unlisted option"] },
      { label: "Employment verification badge", values: [true, true, true] },
      { label: "Creator analytics and exports", values: [false, false, true] },
      { label: "Host a Story Room", values: [false, false, true] },
    ],
  },
  {
    title: "Core",
    rows: [
      { label: "Ad-free feed", values: [false, true, true] },
      { label: "Humble Brag Translator", values: ["1 / day", "3 / day", "30 / day"] },
      { label: "Resume Roast AI", values: ["1 / day", "3 / day", "15 / day"] },
      { label: "Join Vent Rooms", values: [false, true, true] },
      { label: "Start Vent Rooms", values: [false, false, true] },
      { label: "Verified tick", values: [false, "Plus tick", "Pro tick"] },
    ],
  },
  {
    title: "Professional visibility",
    rows: [
      { label: "Profile visibility boost", values: ["Normal", "Increased discovery", "Significantly increased"] },
      { label: "Who viewed your profile", values: ["None", "Limited", "Full"] },
      { label: "Profile analytics", values: [false, "Basic", "Full"] },
    ],
  },
  {
    title: "Messaging",
    rows: [
      { label: "Priority messages", values: [false, false, true] },
      { label: "Message requests per day", values: ["5", "20", "60"] },
      { label: "Message people outside your network", values: ["Network only", true, true] },
      { label: "Message limits", values: ["200 / day", "200 / day", "1,000 / day"] },
      { label: "Message analytics", values: [false, false, true] },
      { label: "AI-assisted outreach", values: [false, false, true] },
    ],
  },
];
const ROWS = SECTIONS.flatMap((s) => s.rows);

function Cell({ value, highlight }) {
  if (value === true) return <Check size={15} style={{ color: highlight ? C.mustard : C.text }} />;
  if (value === false) return <Minus size={15} style={{ color: C.line }} />;
  return <span style={{ ...monoFont, fontSize: 12, fontWeight: highlight ? 700 : 500, color: highlight ? C.mustard : C.text }}>{value}</span>;
}

export default function PremiumPage() {
  const { user, loading, refresh } = useAuth();
  const [selected, setSelected] = useState("plus");
  const [interval, setIntervalChoice] = useState("year");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const currentTier = user?.premiumTier || "basic";

  useEffect(() => {
  }, []);

  // Land here after Stripe Checkout: the webhook (not this redirect) is
  // what actually flips the plan, and it can lag a few seconds, so poll
  // the account a couple of times instead of showing a stale plan.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const status = new URLSearchParams(window.location.search).get("checkout");
    if (status === "success") {
      setNotice("Payment received — your plan is updating…");
      const t1 = setTimeout(() => refresh(), 3000);
      const t2 = setTimeout(() => { refresh(); setNotice(null); }, 8000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    if (status === "cancelled") setNotice("Checkout cancelled — you haven't been charged.");
  }, [refresh]);

  useEffect(() => {
    if (user) setSelected(currentTier === "basic" ? "plus" : currentTier);
  }, [user?.premiumTier]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = !!user?.emailVerified;
  const phoneOk = !!user?.phoneVerified;
  const requirementsMet = emailOk && phoneOk;
  const selectedIdx = TIERS.findIndex((t) => t.key === selected);
  const selectedTier = TIERS[selectedIdx];

  async function run(fn) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e.message); setBusy(false); return; }
    setBusy(false);
  }

  const startCheckout = () => run(async () => {
    const { url } = await api.createCheckoutSession(selected, interval);
    window.location.href = url;
  });
  const openPortal = () => run(async () => {
    const { url } = await api.createPortalSession();
    window.location.href = url;
  });

  function Cta() {
    if (loading) return <div className="lo-skeleton" style={{ height: 46 }} />;
    if (!user) {
      return <Link href="/login" className="lo-tap" style={{ ...monoFont, fontSize: 13, color: "#fff", background: C.mustard, borderRadius: 10, padding: "13px 18px", fontWeight: 700, textAlign: "center", textDecoration: "none" }}>Log in to choose a plan</Link>;
    }
    const primary = { ...monoFont, fontSize: 13, color: "#fff", background: C.mustard, border: "none", borderRadius: 10, padding: "13px 18px", fontWeight: 700, cursor: "pointer" };
    const ghost = { ...monoFont, fontSize: 12, color: C.text, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 16px", cursor: "pointer" };

    if (selected === currentTier) {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 12.5, color: C.mustard }}><BadgeCheck size={15} /> This is your current plan</div>
          {currentTier !== "basic" && (
            <button onClick={openPortal} disabled={busy} style={ghost} className="flex items-center justify-center gap-1.5"><ExternalLink size={13} /> {busy ? "opening…" : "Manage billing"}</button>
          )}
        </div>
      );
    }
    if (selected === "basic") {
      return <button onClick={openPortal} disabled={busy} style={ghost} className="flex items-center justify-center gap-1.5"><ExternalLink size={13} /> {busy ? "opening…" : "Cancel or change in billing portal"}</button>;
    }
    // Moving between paid plans goes through the billing portal — starting
    // a second Checkout would create a second, overlapping subscription.
    if (currentTier !== "basic") {
      return <button onClick={openPortal} disabled={busy} style={primary} className="flex items-center justify-center gap-1.5"><ExternalLink size={14} /> {busy ? "opening…" : `Switch to ${selectedTier.name} in billing portal`}</button>;
    }
    const disabled = busy || !requirementsMet;
    const label = busy ? "working…" : `${currentTier === "basic" ? "Upgrade" : "Switch"} to ${selectedTier.name}`;
    return (
      <button onClick={startCheckout} disabled={disabled} style={{ ...primary, opacity: disabled ? 0.45 : 1, cursor: disabled ? "not-allowed" : "pointer" }} className="flex items-center justify-center gap-2">
        <Sparkles size={14} /> {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 12, color: C.mustard, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <Sparkles size={13} /> Plans
        </div>
        <h1 style={{ ...displayFont, fontSize: 22, fontWeight: 800, color: C.text }}>Pick the plan that fits how you use Linkedout</h1>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, maxWidth: 560 }}>
          {"Reading Stories, telling Stories and seeing company patterns are free on every plan. Paid plans add depth and convenience, never the right to speak. Billed through Stripe; cancel or switch any time from the billing portal."}
        </p>
      </div>

      {notice && <div style={{ ...monoFont, fontSize: 12, color: C.text, background: alpha(C.mustard, 14), border: `1px solid ${alpha(C.mustard, 40)}`, borderRadius: 10, padding: "10px 12px" }}>{notice}</div>}

      <div className="flex gap-2 items-center" role="group" aria-label="Billing period">
        {[["month", "Monthly"], ["year", "Annual (save ~12%)"]].map(([k, l]) => (
          <button key={k} onClick={() => setIntervalChoice(k)} className="lo-btn lo-btn-sm" style={{ background: interval === k ? C.mustard : "transparent", color: interval === k ? "#fff" : C.text2, border: `1px solid ${interval === k ? C.mustard : C.line}` }}>{l}</button>
        ))}
      </div>

      {/* Horizontal tier selector: cards sit side by side (swipeable on
          narrow screens) and the selected one lifts and lights up. */}
      <div style={{ display: "grid", gridAutoFlow: "column", gridAutoColumns: "minmax(210px, 1fr)", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6 }}>
        {TIERS.map((tier) => {
          const active = tier.key === selected;
          const isCurrent = tier.key === currentTier && !!user;
          const Icon = tier.icon;
          return (
            <button
              key={tier.key}
              onClick={() => setSelected(tier.key)}
              className="lo-tap"
              style={{
                scrollSnapAlign: "center", textAlign: "left", cursor: "pointer",
                background: active ? `linear-gradient(155deg, ${alpha(C.mustard, 18)}, ${C.surface})` : C.surface,
                border: `1px solid ${active ? alpha(C.mustard, 60) : C.line}`,
                borderRadius: 14, padding: 16, display: "flex", flexDirection: "column", gap: 8,
                transform: active ? "translateY(-4px)" : "none",
                boxShadow: active ? `0 10px 30px ${alpha(C.mustard, 18)}` : "none",
                opacity: active ? 1 : 0.78,
                transition: "transform .18s ease, box-shadow .18s ease, opacity .18s ease, border-color .18s ease",
              }}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: active ? C.mustard : C.muted }}>
                  <Icon size={13} /> {tier.name} · {tier.tagline}
                </span>
                {isCurrent && <span style={{ ...monoFont, fontSize: 12, color: C.mustard, border: `1px solid ${alpha(C.mustard, 45)}`, borderRadius: 20, padding: "2px 8px" }}>YOUR PLAN</span>}
              </div>
              <div style={{ ...displayFont, fontSize: 26, fontWeight: 800, color: C.text }}>
                {tier.key === "basic" ? "$0" : `$${(interval === "year" ? PLANS[tier.key].annualMonthly : PLANS[tier.key].monthly).toFixed(2)}`}<span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}> {tier.key === "basic" ? "free forever" : "per month"}</span>
                {tier.key !== "basic" && interval === "year" && <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 400 }}>${PLANS[tier.key].annual.toFixed(2)} billed yearly</div>}
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{tier.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Comparison matrix: the selected column is highlighted, so the
          table answers "what do I get on THIS plan" at a glance without
          re-stacking three separate feature lists. */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, overflowX: "auto" }}>
        <div style={{ minWidth: 520 }}>
          <div className="grid" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr", borderBottom: `1px solid ${C.line}` }}>
            <div style={{ padding: "12px 14px", ...monoFont, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>What you get</div>
            {TIERS.map((t) => (
              <button key={t.key} onClick={() => setSelected(t.key)} style={{ padding: "12px 8px", textAlign: "center", cursor: "pointer", background: t.key === selected ? alpha(C.mustard, 12) : "transparent", border: "none", ...monoFont, fontSize: 12, fontWeight: 700, color: t.key === selected ? C.mustard : C.muted }}>
                {t.name}
              </button>
            ))}
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec.title}>
              <div style={{ padding: "9px 14px", background: C.surface2, ...monoFont, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `1px solid ${C.line}` }}>{sec.title}</div>
              {sec.rows.map((row) => (
                <div key={row.label} className="grid" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr", borderBottom: `1px solid ${C.line}` }}>
                  <div style={{ padding: "11px 14px", fontSize: 12.5, color: C.text }}>{row.label}</div>
                  {row.values.map((v, i) => (
                    <div key={i} className="flex items-center justify-center text-center" style={{ padding: "11px 8px", background: TIERS[i].key === selected ? alpha(C.mustard, 8) : "transparent", transition: "background .18s ease" }}>
                      <Cell value={v} highlight={TIERS[i].key === selected} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Requirements + CTA for whichever plan is selected. */}
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }} className="flex flex-col gap-3">
        {selected !== "basic" && selected !== currentTier && (
          <div className="flex flex-col gap-2">
            <div style={{ ...monoFont, fontSize: 12, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Requirements for {selectedTier.name}</div>
            {[{ ok: emailOk, label: "Verified email address" }, { ok: phoneOk, label: "Verified phone number" }].map((req) => (
              <div key={req.label} className="flex items-center gap-2" style={{ fontSize: 12.5, color: req.ok ? C.text : C.muted }}>
                {user ? (req.ok ? <Check size={14} style={{ color: C.mustard }} /> : <CircleDashed size={14} />) : <CircleDashed size={14} />}
                {req.label}
              </div>
            ))}
            {user && !requirementsMet && (
              <Link href="/settings" style={{ ...monoFont, fontSize: 12, color: C.mustard, textDecoration: "none" }}>Verify in Settings →</Link>
            )}
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Cta />
      </div>
    </div>
  );
}
