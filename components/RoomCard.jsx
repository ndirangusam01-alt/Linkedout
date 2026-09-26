"use client";
import { useState } from "react";
import { Users, Info } from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { PulseDot } from "@/components/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/app/auth-provider";
import VentAudioRoom from "@/components/VentAudioRoom";

export default function RoomCard({ room: initialRoom }) {
  const { user } = useAuth();
  const [room, setRoom] = useState(initialRoom);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.joinRoom(room.id);
      setRoom(updated);
      setJoined(true);
    } catch (e) {
      setError(e.status === 401 ? "Log in to join." : e.message);
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    try {
      const updated = await api.leaveRoom(room.id);
      setRoom(updated);
      setJoined(false);
    } catch {
      // leaving quietly fails safe — the join stays server-side, harmless
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {room.live ? <PulseDot /> : <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.line, display: "inline-block" }} />}
            <span style={{ ...displayFont, fontSize: 15, color: C.text }}>{room.topic}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5" style={{ ...monoFont, fontSize: 11, color: C.muted }}>
            <span>{room.vibe}</span>
            <span className="flex items-center gap-1"><Users size={12} /> {room.listeners} joined</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 10, color: C.muted }}>
        <Info size={11} /> Identity stays hidden from other participants — no real names or accounts are ever shared in a room.
      </div>

      {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}

      {joined ? (
        <div className="flex flex-col gap-3" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
          <VentAudioRoom roomId={room.id} roomTopic={room.topic} />
          <button onClick={leave} disabled={busy} className="lo-tap" style={{ ...monoFont, fontSize: 11, color: C.flag, background: "transparent", border: `1px solid ${alpha(C.flag, 40)}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", alignSelf: "flex-start" }}>Leave</button>
        </div>
      ) : (
        <button onClick={join} disabled={busy || !user} className="lo-tap" style={{ ...monoFont, fontSize: 12, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, alignSelf: "flex-start", cursor: "pointer", opacity: user ? 1 : 0.5 }}>
          {busy ? "joining…" : user ? "Join room" : "Log in to join"}
        </button>
      )}
    </div>
  );
}
