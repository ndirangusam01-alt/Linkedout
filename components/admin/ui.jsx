"use client";
import { C, monoFont } from "@/lib/theme";

export const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
export const btn = (kind) => ({ background: kind === "primary" ? C.corpblue : "transparent", color: kind === "primary" ? "#fff" : kind === "danger" ? C.flag : C.text, border: `1px solid ${kind === "primary" ? C.corpblue : kind === "danger" ? C.flag : C.line}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" });
export const inputStyle = { background: C.paper, color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, width: "100%" };

export function Stat({ label, value, tone }) {
  return (
    <div style={{ ...card, padding: "10px 12px" }}>
      <div style={{ ...monoFont, fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone || C.text }}>{typeof value === "number" ? value.toLocaleString() : value}</div>
    </div>
  );
}
export function Pill({ children }) {
  const t = String(children);
  const color = /active|verified|approved|healthy|ok|accepted|complied|actioned|resolved|configured|public/.test(t) ? C.green : /suspend|ban|lock|reject|removed|revoked|missing|down|pending|open|high/.test(t) ? C.flag : C.mustard;
  return <span style={{ ...monoFont, fontSize: 11, color, border: `1px solid ${color}55`, borderRadius: 99, padding: "1px 8px" }}>{t}</span>;
}
export function Sparkline({ data, height = 56 }) {
  const max = Math.max(1, ...data), w = 200;
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * w},${height - 4 - (v / max) * (height - 8)}`).join(" ");
  return <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height }}><polyline points={pts} fill="none" stroke={C.corpblue} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}
