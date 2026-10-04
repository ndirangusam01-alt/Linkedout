import { NextResponse } from "next/server";
import { contentDb } from "@/lib/content/db";
import { getFeedSettings } from "@/lib/admin/service";

// Public: what the feed needs from the admin "Feed Controls" — ad frequency / kill
// switch and currently-live announcements. Cached briefly at the edge.
export async function GET() {
  const s = await getFeedSettings();
  const now = new Date().toISOString();
  const ann = await contentDb.prepare("SELECT id, title, body, severity, audience FROM announcements WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?) ORDER BY created_at DESC LIMIT 3").all(now, now);
  return NextResponse.json({ adsEnabled: s.ads_enabled !== "0", adEvery: Math.max(2, Number(s.ad_every) || 5), announcements: ann }, { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } });
}
