import { NextResponse } from "next/server";
import { isGifSearchConfigured, searchGifs, trendingGifs } from "@/lib/gifs";

export async function GET(request) {
  if (!isGifSearchConfigured()) return NextResponse.json({ configured: false, results: [] });

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  try {
    const results = q ? await searchGifs(q) : await trendingGifs();
    return NextResponse.json({ configured: true, results });
  } catch (e) {
    return NextResponse.json({ configured: true, results: [], error: e.message }, { status: 502 });
  }
}
