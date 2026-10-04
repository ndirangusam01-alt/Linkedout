"use client";
import { MessagesSquare, Lock } from "lucide-react";
import { C, monoFont, displayFont } from "@/lib/theme";

export default function MessagesHome() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center" style={{ flex: 1, border: `1px dashed ${C.line}`, borderRadius: 16, padding: 24 }}>
      <MessagesSquare size={34} color={C.muted} />
      <div style={{ ...displayFont, fontSize: 17, color: C.text }}>Your messages</div>
      <p style={{ fontSize: 13, color: C.muted, maxWidth: 340, lineHeight: 1.55 }}>Pick a conversation, or open someone's profile and tap <b>Message</b>. People choose whether to accept, so there's no unwanted inbox.</p>
      <div className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}><Lock size={11} /> Aliases only · encrypted at rest · you control who can reach you</div>
    </div>
  );
}
