"use client";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";

export default function AdCard({ ad }) {
  return (
    <div
      style={{ background: C.surface, border: `1px dashed ${alpha(C.corpblue, 53)}`, borderRadius: 10 }}
      className="p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1.5"
          style={{ ...monoFont, fontSize: 10, color: C.corpblue, border: `1px solid ${alpha(C.corpblue, 40)}`, borderRadius: 20, padding: "2px 8px" }}
        >
          <Megaphone size={11} /> Sponsored — self-aware
        </span>
        <Link href="/premium" style={{ ...monoFont, fontSize: 10, color: C.muted, textDecoration: "underline" }}>
          remove ads
        </Link>
      </div>
      <div>
        <div style={{ ...displayFont, fontSize: 14, color: C.text }}>{ad.brand}</div>
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginTop: 4 }}>{ad.tagline}</p>
      </div>
      <button
        style={{
          ...monoFont, fontSize: 11.5, color: C.corpblue, background: "transparent",
          border: `1px solid ${alpha(C.corpblue, 53)}`, borderRadius: 8, padding: "7px 12px",
          alignSelf: "flex-start",
        }}
      >{ad.cta} →</button>
    </div>
  );
}
