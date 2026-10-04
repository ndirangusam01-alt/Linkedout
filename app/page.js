"use client";
import { useEffect, useState } from "react";
import { RefreshCw, ArrowUp } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { usePosts } from "./providers";
import { useAuth } from "@/app/auth-provider";
import { useComposer } from "@/app/composer-provider";
import PostCard from "@/components/PostCard";
import AdCard from "@/components/AdCard";
import { api } from "@/lib/api";
import { POST_TYPES } from "@/lib/data";

const AD_FREQUENCY = 4; // one ad every N posts — the cap that keeps this from becoming a nuisance

export default function FeedPage() {
  const { posts, loading, error, hasMore, loadMore, loadingMore, refresh, refreshing, newCount } = usePosts();
  const { user } = useAuth();
  const composer = useComposer();
  const [sort, setSort] = useState("chrono");
  const [ads, setAds] = useState([]);
  const [cfg, setCfg] = useState({ adsEnabled: true, adEvery: AD_FREQUENCY, announcements: [] });

  useEffect(() => {
    api.getAds().then(setAds).catch(() => setAds([]));
    api.getFeedConfig().then(setCfg).catch(() => {});
  }, []);

  const showAds = cfg.adsEnabled && !user?.isPremium && ads.length > 0;
  const notes = (cfg.announcements || []).filter((a) => a.audience === "all" || (a.audience === "premium" ? user?.isPremium : !user?.isPremium));

  return (
    <div className="flex flex-col gap-4">
      {notes.map((a) => (
        <div key={a.id} role="note" style={{ background: a.severity === "critical" ? alpha(C.flag, 14) : a.severity === "warning" ? alpha(C.mustard, 16) : alpha(C.corpblue, 12), border: `1px solid ${a.severity === "critical" ? C.flag : a.severity === "warning" ? C.mustard : C.corpblue}`, borderRadius: 12, padding: "10px 14px" }}>
          <div style={{ ...monoFont, fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.title}</div>
          {a.body && <div style={{ fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.5 }}>{a.body}</div>}
        </div>
      ))}
      <button
        onClick={composer.open}
        style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, textAlign: "left" }}
        className="p-4 w-full"
      >
        <div className="flex items-center gap-2 mb-3">
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.surface2 }} />
          <div style={{ flex: 1, background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", color: C.muted, fontSize: 13 }}>
            What actually happened today...
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {POST_TYPES.map((t) => (
              <span key={t} style={{ ...monoFont, fontSize: 10.5, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 20, padding: "3px 9px" }}>{t}</span>
            ))}
          </div>
          <span style={{ background: C.mustard, color: "#FFFFFF", fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "6px 14px" }}>Post</span>
        </div>
      </button>

      {newCount > 0 && (
        <button
          onClick={() => { refresh(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="lo-tap flex items-center justify-center gap-2"
          style={{ position: "sticky", top: 8, zIndex: 20, ...monoFont, fontSize: 12, fontWeight: 700, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 999, padding: "9px 16px", cursor: "pointer", alignSelf: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}
        >
          <ArrowUp size={13} /> {newCount} new post{newCount === 1 ? "" : "s"}
        </button>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setSort("chrono")}
          style={{ ...monoFont, fontSize: 11, padding: "5px 10px", borderRadius: 20, border: `1px solid ${sort === "chrono" ? C.mustard : C.line}`, color: sort === "chrono" ? C.mustard : C.muted, background: "transparent" }}
        >Chronological</button>
        <button
          onClick={() => setSort("chaotic")}
          style={{ ...monoFont, fontSize: 11, padding: "5px 10px", borderRadius: 20, border: `1px solid ${sort === "chaotic" ? C.flag : C.line}`, color: sort === "chaotic" ? C.flag : C.muted, background: "transparent" }}
        >🔥 Most Chaotic</button>
        <button onClick={refresh} disabled={refreshing} className="lo-tap ml-auto flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 20, padding: "5px 10px", cursor: "pointer" }}>
          <RefreshCw size={11} className={refreshing ? "lo-spin" : ""} /> {refreshing ? "refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading feed…</div>}
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load the feed: {error}</div>}

      {posts.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-4">
          <PostCard post={p} />
          {showAds && (i + 1) % cfg.adEvery === 0 && (
            <AdCard ad={ads[Math.floor(i / cfg.adEvery) % ads.length]} />
          )}
        </div>
      ))}

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="lo-tap" style={{ ...monoFont, fontSize: 12, color: C.text, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 16px", cursor: "pointer", alignSelf: "center" }}>
          {loadingMore ? "loading…" : "Load older posts"}
        </button>
      )}
    </div>
  );
}
