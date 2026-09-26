"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, EyeOff, UserPlus, UserCheck } from "lucide-react";
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
        </>
      )}
    </div>
  );
}
