"use client";
import { useEffect, useState } from "react";
import { C, monoFont, displayFont } from "@/lib/theme";
import { api } from "@/lib/api";
import AwardCard from "@/components/AwardCard";

export default function AwardsPage() {
  const [awards, setAwards] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getAwards().then(setAwards).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4">
        <div style={{ ...displayFont, fontSize: 16, color: C.text }}>This Week's Cringe Awards</div>
        <p style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          Real posts, nominated by their own authors at post time, ranked by votes. Vote via the trophy pill on any nominated post.
        </p>
      </div>
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load awards: {error}</div>}
      {!awards && !error && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading awards…</div>}
      {awards && awards.map((a) => <AwardCard key={a.id} award={a} />)}
    </div>
  );
}
