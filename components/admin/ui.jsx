"use client";
import { C, monoFont } from "@/lib/theme";

// Admin design primitives — same tokens as the product, tuned for density.
export const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 };
export const btn = (kind) => ({
  background: kind === "primary" ? "var(--lo-grad)" : kind === "danger" ? "transparent" : C.surface2,
  color: kind === "primary" ? "#fff" : kind === "danger" ? C.flag : C.text,
  border: `1px solid ${kind === "primary" ? "transparent" : kind === "danger" ? "color-mix(in srgb, var(--lo-flag) 45%, transparent)" : C.line2}`,
  borderRadius: 9, padding: "7px 13px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", minHeight: 34,
});
export const inputStyle = { background: C.surface2, color: C.text, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "9px 12px", fontSize: 14.5, width: "100%", minHeight: 40 };

export function Stat({ label, value, tone }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 750, letterSpacing: "-0.02em", color: tone || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
export function Pill({ children }) {
  const t = String(children);
  const tone = /active|verified|approved|healthy|ok|accepted|complied|actioned|resolved|configured|public|live|on\b/.test(t) ? "green" : /suspend|ban|lock|reject|removed|revoked|missing|down|pending|open|high|off\b/.test(t) ? "flag" : "accent";
  const c = tone === "green" ? C.green : tone === "flag" ? C.flag : C.mustard;
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 600, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>{t}</span>;
}
export function Sparkline({ data, height = 56 }) {
  const max = Math.max(1, ...data), w = 200;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${height - 4 - (v / max) * (height - 8)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}><polyline points={pts} fill="none" stroke="var(--lo-mustard)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /></svg>;
}
