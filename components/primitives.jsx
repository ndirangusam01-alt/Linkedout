"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { api } from "@/lib/api";

export function Stamp({ text, tone = "flag", rotate = -8 }) {
  const color = tone === "flag" ? C.flag : tone === "green" ? C.green : C.mustard;
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        border: `2px solid ${color}`, color, borderRadius: 3,
        padding: "2px 8px", fontSize: 10, ...displayFont, fontWeight: 800,
        transform: `rotate(${rotate}deg)`, letterSpacing: "0.06em",
        textTransform: "uppercase", background: "rgba(0,0,0,0.15)",
      }}
    >
      {text}
    </span>
  );
}

export function Redacted({ value }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <button
      onClick={() => setRevealed((r) => !r)}
      className="rounded"
      style={{
        ...monoFont, fontSize: 13, padding: "2px 8px", border: "none", cursor: "pointer",
        background: revealed ? "transparent" : "#0B0B0D",
        color: revealed ? C.mustard : "#0B0B0D",
        outline: revealed ? `1px dashed ${C.line}` : "none",
      }}
      title={revealed ? "Tap to hide" : "Tap to reveal"}
    >
      {revealed ? value : "\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588"}
    </button>
  );
}

export function ReactionBar({ postId, r, myReaction }) {
  const items = [
    { k: "cry", icon: "😩" }, { k: "laugh", icon: "😂" },
    { k: "skull", icon: "💀" }, { k: "flag", icon: "🚩" },
  ];
  const [counts, setCounts] = useState(r);
  const [picked, setPicked] = useState(myReaction || null);
  const [notice, setNotice] = useState(null);

  function flashNotice(message) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  async function toggle(key) {
    const prevCounts = counts;
    const prevPicked = picked;
    const removing = picked === key;

    // optimistic update — reconciled with the server's real, deduped
    // counts below. The server enforces "one active reaction per account
    // per post," which is what actually prevents count inflation; this
    // optimistic update is purely a snappier UI, not the source of truth.
    const next = { ...counts, [key]: counts[key] + (removing ? -1 : 1) };
    if (picked && !removing) next[picked] = counts[picked] - 1;
    setCounts(next);
    setPicked(removing ? null : key);

    try {
      const updated = await api.reactToPost(postId, key);
      setCounts(updated.r);
      setPicked(updated.myReaction);
    } catch (e) {
      setCounts(prevCounts);
      setPicked(prevPicked);
      flashNotice(e.status === 401 ? "Log in to react." : e.message);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        {items.map((it) => (
          <button
            key={it.k}
            onClick={() => toggle(it.k)}
            className="flex items-center gap-1 rounded-full transition"
            style={{
              padding: "4px 10px", fontSize: 12, ...monoFont,
              background: picked === it.k ? C.surface2 : "transparent",
              border: `1px solid ${picked === it.k ? C.muted : C.line}`,
              color: picked === it.k ? C.text : C.muted,
            }}
          >
            <span>{it.icon}</span><span>{counts[it.k]}</span>
          </button>
        ))}
      </div>
      {notice && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{notice}</div>}
    </div>
  );
}

export function MoodPill({ text }) {
  return (
    <span style={{
      ...monoFont, fontSize: 11, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`,
      background: alpha(C.mustard, 8), padding: "1px 8px", borderRadius: 20,
    }}>{text}</span>
  );
}

export function PulseDot({ color = C.flag }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "lo-pulse 1.6s ease-out infinite" }} />
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color }} />
    </span>
  );
}

export function Modal({ open, onClose, title, children, icon: Icon }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(10,10,12,0.72)", zIndex: 50,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "lo-fade-up 0.18s ease both",
      }}
      className="sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, width: "100%",
          maxWidth: 480, maxHeight: "88vh", overflowY: "auto",
          animation: "lo-toast-in 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.1) both",
        }}
        className="p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ ...displayFont, fontSize: 16, color: C.text }}>
            {Icon && <Icon size={16} color={C.mustard} />} {title}
          </div>
          <button onClick={onClose} className="lo-tap" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", borderRadius: 8 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Small confirm/feedback toast — replaces plain-text inline notices with
// a pill that slides in, so actions (bookmarked, link copied, reposted)
// visibly acknowledge themselves instead of just quietly changing state.
export function Toast({ message, tone = "default" }) {
  if (!message) return null;
  const color = tone === "error" ? C.flag : tone === "success" ? C.green : C.mustard;
  return (
    <div
      className="lo-toast"
      style={{
        ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: color,
        borderRadius: 20, padding: "6px 14px", display: "inline-flex", alignItems: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
      }}
    >
      {message}
    </div>
  );
}
