"use client";
import { useEffect, useState } from "react";
import { C, monoFont } from "@/lib/theme";
import { usePosts } from "./providers";
import { useAuth } from "@/app/auth-provider";
import { useComposer } from "@/app/composer-provider";
import PostCard from "@/components/PostCard";
import AdCard from "@/components/AdCard";
import { api } from "@/lib/api";
import { POST_TYPES } from "@/lib/data";

const AD_FREQUENCY = 4; // one ad every N posts — the cap that keeps this from becoming a nuisance

export default function FeedPage() {
  const { posts, loading, error } = usePosts();
  const { user } = useAuth();
  const composer = useComposer();
  const [sort, setSort] = useState("chrono");
  const [ads, setAds] = useState([]);

  useEffect(() => {
    api.getAds().then(setAds).catch(() => setAds([]));
  }, []);

  const showAds = !user?.isPremium && ads.length > 0;

  return (
    <div className="flex flex-col gap-4">
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

      <div className="flex items-center gap-2">
        <button
          onClick={() => setSort("chrono")}
          style={{ ...monoFont, fontSize: 11, padding: "5px 10px", borderRadius: 20, border: `1px solid ${sort === "chrono" ? C.mustard : C.line}`, color: sort === "chrono" ? C.mustard : C.muted, background: "transparent" }}
        >Chronological</button>
        <button
          onClick={() => setSort("chaotic")}
          style={{ ...monoFont, fontSize: 11, padding: "5px 10px", borderRadius: 20, border: `1px solid ${sort === "chaotic" ? C.flag : C.line}`, color: sort === "chaotic" ? C.flag : C.muted, background: "transparent" }}
        >🔥 Most Chaotic</button>
        <span style={{ ...monoFont, fontSize: 10.5, color: C.muted }} className="ml-auto">no algorithmic inspiration, ever</span>
      </div>

      {loading && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading feed…</div>}
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load the feed: {error}</div>}

      {posts.map((p, i) => (
        <div key={p.id} className="flex flex-col gap-4">
          <PostCard post={p} />
          {showAds && (i + 1) % AD_FREQUENCY === 0 && (
            <AdCard ad={ads[Math.floor(i / AD_FREQUENCY) % ads.length]} />
          )}
        </div>
      ))}
    </div>
  );
}
