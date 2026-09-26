"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, PhoneOff, Volume2, RadioTower, Hand, Crown, UserCheck } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { api } from "@/lib/api";

// Real-time audio + speaker moderation for a vent room. Roles (host /
// speaker / listener) live server-side and decide canPublish on the
// LiveKit token at connect time. A role change *while already
// connected* can't revoke an already-issued token's permissions, so:
//   - Promotion triggers the promoted client to reconnect with a fresh
//     (now canPublish:true) token — that's the only way for them to
//     actually gain mic capability mid-session.
//   - Demotion is enforced cooperatively over LiveKit's data channel: the
//     host's action broadcasts a "demoted" message, and a compliant
//     client immediately disables its own mic. This is honest about what
//     it is — not a server-enforced hard mute — documented here and in
//     the token route rather than overclaimed.
export default function VentAudioRoom({ roomId, roomTopic }) {
  const [status, setStatus] = useState("connecting"); // connecting | connected | fallback | ended
  const [muted, setMuted] = useState(false);
  const [speakerIds, setSpeakerIds] = useState([]);
  const [myRole, setMyRole] = useState("listener");
  const [handRaised, setHandRaised] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [busyHandle, setBusyHandle] = useState(null);
  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const myHandleRef = useRef(null);

  const refreshParticipants = useCallback(() => {
    api.getRoomParticipants(roomId).then((r) => setParticipants(r.participants)).catch(() => {});
  }, [roomId]);

  const connect = useCallback(async (isReconnect = false) => {
    try {
      const tokenRes = await api.getRoomToken(roomId);
      if (!tokenRes?.configured) { setStatus("fallback"); return; }
      setMyRole(tokenRes.role || "listener");

      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== "audio") return;
        const el = track.attach();
        el.autoplay = true;
        audioContainerRef.current?.appendChild(el);
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => setSpeakerIds(speakers.map((s) => s.identity)));
      room.on(RoomEvent.ParticipantConnected, refreshParticipants);
      room.on(RoomEvent.ParticipantDisconnected, refreshParticipants);
      room.on(RoomEvent.Disconnected, () => setStatus((s) => (s === "connected" ? "ended" : s)));

      // Cooperative moderation messages, broadcast to the whole room —
      // every client checks whether it's the intended target.
      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.target !== myHandleRef.current) { refreshParticipants(); return; }
          if (msg.type === "demoted") {
            room.localParticipant.setMicrophoneEnabled(false);
            setMuted(true);
            setMyRole("listener");
          } else if (msg.type === "promoted") {
            setMyRole("speaker");
            connect(true); // reconnect to get a canPublish:true token
          }
          refreshParticipants();
        } catch { /* ignore malformed data messages */ }
      });

      await room.connect(tokenRes.url, tokenRes.jwt);
      myHandleRef.current = room.localParticipant.identity;
      if (tokenRes.role === "host" || tokenRes.role === "speaker") {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      setStatus("connected");
      refreshParticipants();
    } catch {
      setStatus("fallback");
    }
  }, [roomId, refreshParticipants]);

  useEffect(() => {
    let cancelled = false;
    connect();
    const interval = setInterval(refreshParticipants, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const room = roomRef.current;
    if (!room || (myRole !== "host" && myRole !== "speaker")) return;
    const next = !muted;
    room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  async function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    try { await api.raiseHand(roomId, next); } catch { setHandRaised(!next); }
  }

  async function broadcast(type, targetHandle) {
    const room = roomRef.current;
    if (!room) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type, target: targetHandle }));
    await room.localParticipant.publishData(payload, { reliable: true });
  }

  async function promote(handle) {
    setBusyHandle(handle);
    try {
      const { participants: next } = await api.promoteToSpeaker(roomId, handle);
      setParticipants(next);
      await broadcast("promoted", handle);
    } catch { /* surfaced via participants staying unchanged */ }
    finally { setBusyHandle(null); }
  }

  async function demote(handle) {
    setBusyHandle(handle);
    try {
      const { participants: next } = await api.demoteToListener(roomId, handle);
      setParticipants(next);
      await broadcast("demoted", handle);
    } catch { /* surfaced via participants staying unchanged */ }
    finally { setBusyHandle(null); }
  }

  function leave() {
    roomRef.current?.disconnect();
    setStatus("ended");
  }

  if (status === "fallback") {
    return (
      <div className="lo-enter flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.muted, background: alpha(C.corpblue, 8), border: `1px solid ${alpha(C.corpblue, 25)}`, borderRadius: 8, padding: "8px 12px" }}>
        <Volume2 size={13} /> Live audio isn't available on this deployment yet — you're in the waiting room. Joins and chat still work.
      </div>
    );
  }
  if (status === "ended") {
    return <div className="lo-enter" style={{ ...monoFont, fontSize: 11, color: C.muted, padding: "8px 0" }}>You left {roomTopic}.</div>;
  }

  const isHost = myRole === "host";
  const canSpeak = myRole === "host" || myRole === "speaker";
  const raisedHands = participants.filter((p) => p.handRaised && p.role === "listener");

  return (
    <div className="lo-enter flex flex-col gap-3" style={{ background: alpha(C.mustard, 6), border: `1px solid ${alpha(C.mustard, 30)}`, borderRadius: 10, padding: 14 }}>
      <div ref={audioContainerRef} style={{ display: "none" }} />
      <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: status === "connected" ? C.mustard : C.muted }}>
        <RadioTower size={13} className={status === "connecting" ? "lo-spin" : ""} />
        {status === "connecting" ? "Connecting to live audio…" : `Live — you're ${myRole === "host" ? "hosting" : myRole === "speaker" ? "speaking" : "listening"}`}
      </div>

      {status === "connected" && (
        <>
          {isHost && raisedHands.length > 0 && (
            <div className="flex flex-col gap-1.5" style={{ background: alpha(C.corpblue, 8), borderRadius: 8, padding: 8 }}>
              <div style={{ ...monoFont, fontSize: 9.5, color: C.muted, textTransform: "uppercase" }}>Raised hands</div>
              {raisedHands.map((p) => (
                <div key={p.handle} className="flex items-center justify-between">
                  <span style={{ fontSize: 12, color: C.text }}>{p.displayLabel}</span>
                  <button onClick={() => promote(p.handle)} disabled={busyHandle === p.handle} className="lo-tap" style={{ ...monoFont, fontSize: 10, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                    give mic
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <div
                key={p.handle}
                className="flex items-center gap-1.5"
                style={{
                  ...monoFont, fontSize: 10.5, borderRadius: 20, padding: "5px 10px",
                  background: speakerIds.includes(p.handle) ? alpha(C.mustard, 22) : C.surface2,
                  border: speakerIds.includes(p.handle) ? `1px solid ${C.mustard}` : `1px solid ${C.line}`,
                  color: C.text,
                }}
              >
                {p.role === "host" && <Crown size={10} color={C.mustard} />}
                {p.role === "speaker" && <UserCheck size={10} color={C.corpblue} />}
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: speakerIds.includes(p.handle) ? C.mustard : C.line }} />
                {p.displayLabel}
                {p.handRaised && p.role === "listener" && <Hand size={10} color={C.mustard} />}
                {isHost && p.role !== "host" && (
                  <button
                    onClick={() => (p.role === "listener" ? promote(p.handle) : demote(p.handle))}
                    disabled={busyHandle === p.handle}
                    className="lo-tap"
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, marginLeft: 2 }}
                    title={p.role === "listener" ? "Give mic" : "Mute"}
                  >
                    {p.role === "listener" ? <Mic size={11} /> : <MicOff size={11} />}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {canSpeak ? (
              <button onClick={toggleMute} className="lo-tap flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: C.text, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 12px" }}>
                {muted ? <MicOff size={13} /> : <Mic size={13} />} {muted ? "Unmute" : "Mute"}
              </button>
            ) : (
              <button onClick={toggleHand} className="lo-tap flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: handRaised ? "#FFFFFF" : C.text, background: handRaised ? C.mustard : C.surface2, border: `1px solid ${handRaised ? C.mustard : C.line}`, borderRadius: 8, padding: "7px 12px" }}>
                <Hand size={13} /> {handRaised ? "Hand raised" : "Raise hand"}
              </button>
            )}
            <button onClick={leave} className="lo-tap flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: "#FFFFFF", background: C.flag, border: "none", borderRadius: 8, padding: "7px 12px" }}>
              <PhoneOff size={13} /> Leave
            </button>
          </div>
        </>
      )}
    </div>
  );
}
