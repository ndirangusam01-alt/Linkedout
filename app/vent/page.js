"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { api } from "@/lib/api";
import RoomCard from "@/components/RoomCard";
import { useAuth } from "@/app/auth-provider";

function CreateRoomForm({ onCreated, onCancel }) {
  const [topic, setTopic] = useState("");
  const [vibe, setVibe] = useState("Vent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom({ topic: topic.trim(), vibe, mode: "alias" });
      onCreated(room);
    } catch (e) {
      setError(e.status === 401 ? "Log in to start a room." : e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" };

  return (
    <div style={{ background: C.surface, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 10 }} className="p-4 flex flex-col gap-2">
      <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's this room about?" maxLength={80} style={inputStyle} />
      <select value={vibe} onChange={(e) => setVibe(e.target.value)} style={inputStyle}>
        {["Vent", "Support", "Comedy"].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!topic.trim() || busy} style={{ ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, cursor: "pointer" }}>{busy ? "starting…" : "Start room"}</button>
        <button onClick={onCancel} style={{ ...monoFont, fontSize: 11.5, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

export default function VentPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.getRooms().then(setRooms).catch((e) => setError(e.message));
  }, []);

  function handleCreated(room) {
    setRooms((rs) => [room, ...(rs || [])]);
    setShowCreate(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.muted }}>
          <ShieldCheck size={13} /> identity hidden between participants — audio isn't wired up yet, see room detail
        </div>
        {user && !showCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1" style={{ ...monoFont, fontSize: 11, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "4px 10px", background: "none", cursor: "pointer" }}>
            <Plus size={12} /> Start a room
          </button>
        )}
      </div>
      {showCreate && <CreateRoomForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />}
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load rooms: {error}</div>}
      {!rooms && !error && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading rooms…</div>}
      {rooms && rooms.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>No rooms open yet — start one.</div>}
      {rooms && rooms.map((r) => <RoomCard key={r.id} room={r} />)}
    </div>
  );
}
