"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronDown, Skull, Sparkles, Camera, UserCog, Grid3x3, Bookmark, Heart, Settings as SettingsIcon,
} from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import PostCard from "@/components/PostCard";
import ResumeRoastModal from "@/components/ResumeRoastModal";
import { useAuth } from "@/app/auth-provider";
import { api } from "@/lib/api";

const TABS = [
  { key: "overview", label: "Overview", icon: UserCog },
  { key: "posts", label: "Posts", icon: Grid3x3 },
  { key: "likes", label: "Likes", icon: Heart },
  { key: "bookmarks", label: "Bookmarks", icon: Bookmark },
];

export default function ProfilePage() {
  const { user, loading, refresh } = useAuth();
  const [tab, setTab] = useState("overview");

  if (loading) {
    return <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading profile…</div>;
  }

  if (!user) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }}>
        <div className="p-5 flex flex-col gap-3 items-start w-full">
          <p style={{ fontSize: 13.5, color: C.text }}>Log in to see your profile and posts.</p>
          <Link href="/login" style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "9px 16px", fontWeight: 700, textDecoration: "none" }}>Log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProfileHeader user={user} refresh={refresh} />

      <div className="flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}` }}>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-2"
                style={{
                  fontSize: 12.5, color: active ? C.mustard : C.muted, background: "none", border: "none",
                  borderBottom: `2px solid ${active ? C.mustard : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <Link href="/settings" title="Settings & Privacy" style={{ color: C.muted, padding: "8px", flexShrink: 0 }}>
          <SettingsIcon size={16} />
        </Link>
      </div>

      {tab === "overview" && <OverviewTab user={user} />}
      {tab === "posts" && <PostListTab fetcher={api.getMyPosts} emptyText="You haven't posted anything yet." />}
      {tab === "likes" && <PostListTab fetcher={api.getMyLikes} emptyText="Posts you react to will show up here." />}
      {tab === "bookmarks" && <PostListTab fetcher={api.getMyBookmarks} emptyText="Bookmark a post from its share menu to save it here." />}
    </div>
  );
}

/* ---------------------------------------------------------
   HEADER — avatar, pseudonym, real name, bio, badges
--------------------------------------------------------- */
function ProfileHeader({ user, refresh }) {
  const [roastOpen, setRoastOpen] = useState(false);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setAvatarError(null);
    try {
      await api.uploadAvatar(file);
      await refresh();
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-5">
      <ResumeRoastModal open={roastOpen} onClose={() => setRoastOpen(false)} />
      <div className="flex items-center gap-4">
        <div style={{ position: "relative" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 22, overflow: "hidden", ...displayFont }}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.pseudonym} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              user.pseudonym?.[0]?.toUpperCase() || "?"
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Change avatar"
            style={{
              position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%",
              background: C.mustard, border: `2px solid ${C.surface}`, display: "flex", alignItems: "center",
              justifyContent: "center", cursor: "pointer",
            }}
          >
            <Camera size={11} color="#FFFFFF" />
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} style={{ display: "none" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...displayFont, fontSize: 19, color: C.text }}>{user.pseudonym}</div>
          <div style={{ ...monoFont, fontSize: 11, color: C.muted, marginTop: 1 }}>{user.realName}</div>
          {user.badges?.length > 0 && (
            <div className="flex gap-1 flex-wrap" style={{ marginTop: 6 }}>
              {user.badges.slice(0, 4).map((b) => (
                <span key={b.key} title={b.description} style={{ ...monoFont, fontSize: 10, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "2px 8px" }}>{b.label}</span>
              ))}
              {user.badges.length > 4 && <span style={{ ...monoFont, fontSize: 10, color: C.muted }}>+{user.badges.length - 4} more</span>}
            </div>
          )}
        </div>
        <div className="text-right" style={{ flexShrink: 0 }}>
          <div style={{ ...monoFont, fontSize: 10, color: C.muted, textTransform: "uppercase" }}>Badges</div>
          <div style={{ ...displayFont, fontSize: 22, color: C.mustard }}>{user.badges?.length || 0}</div>
        </div>
      </div>

      {avatarError && <div style={{ ...monoFont, fontSize: 11, color: C.flag, marginTop: 8 }}>{avatarError}</div>}
      {user.bio && <p style={{ fontSize: 13, color: C.text, marginTop: 12, lineHeight: 1.5 }}>{user.bio}</p>}

      <button
        onClick={() => setRoastOpen(true)}
        className="flex items-center gap-2 mt-4 w-full"
        style={{ background: alpha(C.mustard, 8), border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "9px 12px", color: C.mustard, fontSize: 12.5 }}
      >
        <Sparkles size={14} /> Roast My Resume <span style={{ marginLeft: "auto", ...monoFont, fontSize: 10.5, color: C.muted }}>opt-in · AI icebreaker</span>
      </button>
    </div>
  );
}

/* ---------------------------------------------------------
   OVERVIEW TAB
--------------------------------------------------------- */
function OverviewTab({ user }) {
  const [cringeHistory, setCringeHistory] = useState(null);

  useEffect(() => {
    api.getMyPosts()
      .then((posts) => {
        const confessions = posts
          .filter((p) => (p.type === "confession" || p.type === "parody") && !p.repostOf)
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 3);
        setCringeHistory(confessions);
      })
      .catch(() => setCringeHistory([]));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div style={{ background: C.surface, border: `1px solid ${user.isPremium ? alpha(C.mustard, 33) : C.line}`, borderRadius: 10 }} className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={15} color={user.isPremium ? C.mustard : C.muted} />
          <div>
            <div style={{ fontSize: 13, color: C.text }}>{user.isPremium ? "LinkedOut Premium" : "Free tier"}</div>
            <div style={{ ...monoFont, fontSize: 11, color: C.muted, marginTop: 2 }}>{user.isPremium ? "ads off · unlimited posts · salary data unlocked" : "ads on · limited anonymous posts"}</div>
          </div>
        </div>
        <Link href="/premium" style={{ ...monoFont, fontSize: 11.5, color: user.isPremium ? C.muted : C.mustard, border: `1px solid ${user.isPremium ? C.line : alpha(C.mustard, 33)}`, borderRadius: 8, padding: "7px 12px", textDecoration: "none" }}>
          {user.isPremium ? "Manage" : "Upgrade"}
        </Link>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-5">
        <div className="flex items-center gap-2 mb-3" style={{ ...monoFont, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <Skull size={13} /> Your Cringe History
        </div>
        {cringeHistory === null && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>}
        {cringeHistory?.length === 0 && (
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
            No confessions or parody posts yet — post one from the composer and it'll show up here.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {cringeHistory?.map((p) => (
            <div key={p.id} className="flex gap-3">
              <div style={{ ...monoFont, fontSize: 10.5, color: C.muted, width: 62, flexShrink: 0, paddingTop: 2 }}>{p.time}</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, borderLeft: `2px solid ${C.line}`, paddingLeft: 10 }}>{p.text}</div>
            </div>
          ))}
        </div>
      </div>

      <Link
        href="/title-translator"
        style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, textDecoration: "none" }}
        className="p-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Sparkles size={15} color={C.corpblue} />
          <div>
            <div style={{ fontSize: 13, color: C.text }}>Humble Brag Translator</div>
            <div style={{ ...monoFont, fontSize: 11, color: C.muted, marginTop: 2 }}>Translate your real title to full LinkedIn-hype, or decode the reverse</div>
          </div>
        </div>
        <ChevronDown size={15} color={C.muted} style={{ transform: "rotate(-90deg)" }} />
      </Link>

      <Link href="/companies" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, textDecoration: "none" }} className="p-5 flex items-center justify-between">
        <div>
          <div style={{ fontSize: 13, color: C.text }}>Salary transparency</div>
          <div style={{ ...monoFont, fontSize: 11, color: C.muted, marginTop: 2 }}>Contribute a salary anonymously to any company page</div>
        </div>
        <ChevronDown size={15} color={C.muted} style={{ transform: "rotate(-90deg)" }} />
      </Link>
    </div>
  );
}

/* ---------------------------------------------------------
   MY POSTS TAB
--------------------------------------------------------- */
function PostListTab({ fetcher, emptyText }) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetcher().then(setPosts).catch((e) => setError(e.message));
  }, [fetcher]);

  return (
    <div className="flex flex-col gap-4">
      <div style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
        Real Name and Alias posts match by identity; Full Anonymous posts aren't linkable back to you even here — by design.
      </div>
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load: {error}</div>}
      {!posts && !error && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>}
      {posts && posts.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>{emptyText}</div>}
      {posts && posts.map((p) => <PostCard key={p.id} post={p} />)}
    </div>
  );
}
