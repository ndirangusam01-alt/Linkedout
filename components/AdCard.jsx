"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";

// Only http(s) destinations are ever followed; anything else is ignored.
function safeUrl(u) {
  try { const x = new URL(u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; }
}

// A sponsored card. The call-to-action button only exists when the ad has a
// real destination (`ad.url`); an ad without one is simply a clean brand
// message, never a button that goes nowhere.
const beacon = (adId, kind) => { if (adId != null) fetch("/api/ads/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ adId, kind }), keepalive: true }).catch(() => {}); };

export default function AdCard({ ad }) {
  const href = ad.url ? safeUrl(ad.url) : null;
  const ref = useRef(null), seen = useRef(false);
  // One impression per card, counted when at least half of it is on screen.
  useEffect(() => {
    const el = ref.current; if (!el || seen.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting && !seen.current) { seen.current = true; beacon(ad.id, "impression"); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el); return () => io.disconnect();
  }, [ad.id]);
  const initial = (ad.brand || "?").trim()[0]?.toUpperCase();
  return (
    <div ref={ref}
      className="p-4 flex flex-col gap-3"
      style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: `inset 3px 0 0 ${alpha(C.corpblue, 45)}` }}
    >
      <div className="flex items-center justify-between">
        <span style={{ ...monoFont, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Sponsored</span>
        <Link href="/premium" style={{ ...monoFont, fontSize: 10, color: C.muted, textDecoration: "none", border: `1px solid ${C.line}`, borderRadius: 999, padding: "2px 9px" }}>
          Go ad-free
        </Link>
      </div>
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16, background: `linear-gradient(135deg, ${C.corpblue}, ${alpha(C.corpblue, 55)})` }}
        >
          {initial}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...displayFont, fontSize: 14.5, color: C.text }}>{ad.brand}</div>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 3 }}>{ad.tagline}</p>
        </div>
      </div>
      {href && ad.cta && (
        <a
          href={href}
          onClick={() => beacon(ad.id, "click")}
          target="_blank"
          rel="sponsored noopener noreferrer"
          style={{ ...monoFont, fontSize: 11.5, color: "#fff", background: C.corpblue, borderRadius: 8, padding: "8px 14px", alignSelf: "flex-start", textDecoration: "none", fontWeight: 600 }}
        >
          {ad.cta}
        </a>
      )}
    </div>
  );
}
