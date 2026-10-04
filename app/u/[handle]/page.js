"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, EyeOff, UserPlus, UserCheck, Mail, X } from "lucide-react";
import { C, monoFont, displayFont } from "@/lib/theme";
import { api } from "@/lib/api";
import { useAuth } from "@/app/auth-provider";
import PostCard from "@/components/PostCard";

export default function AliasProfilePage() {
  const { handle } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  useEffect(() => {
    setProfile(null);
    setError(null);
    api.getAliasProfile(handle).then(setProfile).catch((e) => setError(e.status === 404 ? "There's no profile here." : e.message));
  }, [handle]);

  async function toggleFollow() {
    if (!user || followBusy) return;
    setFollowBusy(true);
    const wasFollowing = profile.isFollowing;
    setProfile((p) => ({ ...p, isFollowing: !wasFollowing, followerCount: p.followerCount + (wasFollowing ? -1 : 1) }));
    try {
      if (wasFollowing) await api.unfollowHandle(handle); else await api.followHandle(handle);
    } catch {
      setProfile((p) => ({ ...p, isFollowing: wasFollowing, followerCount: p.followerCount + (wasFollowing ? 1 : -1) })); // revert
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => router.back()}
        className="lo-tap flex items-center gap-1.5"
        style={{ ...monoFont, fontSize: 12, color: C.muted, background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start", padding: 4, borderRadius: 8 }}
      >
        <ArrowLeft size={15} /> Back
      </button>

      {error && <div style={{ ...monoFont, fontSize: 12.5, color: C.flag }}>{error}</div>}

      {!profile && !error && <div className="lo-skeleton" style={{ height: 90 }} />}

      {profile && (
        <>
          <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }} className="p-5 flex items-center gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
                {profile.displayLabel[0]}
              </div>
            )}
            <div className="flex flex-col gap-1" style={{ flex: 1 }}>
              <div style={{ ...displayFont, fontSize: 18, fontWeight: 800, color: C.text }}>{profile.displayLabel}</div>
              <div className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
                <EyeOff size={11} /> A pseudonym, not a real identity
              </div>
              <div style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
                {profile.postCount} post{profile.postCount === 1 ? "" : "s"} · {profile.followerCount} follower{profile.followerCount === 1 ? "" : "s"} · {profile.totalReactions} reaction{profile.totalReactions === 1 ? "" : "s"}
              </div>
            </div>
            {!profile.isSelf && user && (
              <button onClick={() => setComposeOpen(true)} className="lo-tap flex items-center gap-1.5" aria-label="Message"
                style={{ ...monoFont, fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: "8px 14px", cursor: "pointer", color: C.text, background: "transparent", border: `1px solid ${C.line}` }}>
                <Mail size={13} /> Message
              </button>
            )}
            {!profile.isSelf && user && (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className="lo-tap flex items-center gap-1.5"
                style={{
                  ...monoFont, fontSize: 11.5, fontWeight: 700, borderRadius: 20, padding: "8px 14px", cursor: "pointer",
                  color: profile.isFollowing ? C.text : "#FFFFFF",
                  background: profile.isFollowing ? "transparent" : C.mustard,
                  border: profile.isFollowing ? `1px solid ${C.line}` : "none",
                }}
              >
                {profile.isFollowing ? <UserCheck size={13} /> : <UserPlus size={13} />}
                {profile.isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {profile.posts.length === 0 && (
              <div style={{ ...monoFont, fontSize: 12, color: C.muted, textAlign: "center", padding: "24px 0" }}>Nothing public here yet.</div>
            )}
            {profile.posts.map((p) => <PostCard key={p.id} post={p} />)}
          </div>
          {composeOpen && <MessageRequestDialog handle={handle} name={profile.displayLabel || profile.pseudonym || 'this person'} onClose={() => setComposeOpen(false)} router={router} />}
        </>
      )}
    </div>
  );
}


function MessageRequestDialog({ handle, name, onClose, router }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await api.startConversation(handle, text);
      router.push(`/messages/${r.conversationId}`);
    } catch (e) {
      if (e.body?.conversationId) router.push(`/messages/${e.body.conversationId}`);
      else setErr(e.message);
    } finally { setBusy(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div role="dialog" aria-label="Send message request" onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, width: "100%", maxWidth: 440 }} className="p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between"><span style={{ ...displayFont, fontSize: 16, color: C.text }}>Message {name}</span><button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer" }}><X size={16} /></button></div>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>This sends a <b>request</b>. They choose whether to accept, and you can't send more until they do. Keep it short and respectful.</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={300} placeholder="Say why you're reaching out…" style={{ background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 14, resize: "none", outline: "none" }} />
        <div style={{ ...monoFont, fontSize: 10.5, color: C.muted, textAlign: "right" }}>{text.length}/300</div>
        {err && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{err}</div>}
        <button onClick={send} disabled={busy || !text.trim()} style={{ ...monoFont, fontSize: 12.5, color: "#fff", background: C.mustard, border: "none", borderRadius: 999, padding: "10px 16px", fontWeight: 700, cursor: "pointer", alignSelf: "flex-end", opacity: busy || !text.trim() ? 0.5 : 1 }}>{busy ? "Sending…" : "Send request"}</button>
      </div>
    </div>
  );
}
