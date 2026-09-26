// GIF search for replies, via Tenor's public API. Same lazy/graceful-
// fallback pattern as lib/stripe.js and lib/livekit.js: no TENOR_API_KEY
// set, isGifSearchConfigured() returns false, and the picker UI shows an
// honest "not set up yet" state instead of a broken search box.
//
// Setup: create a free key at https://developers.google.com/tenor/guides/quickstart
// (Tenor is owned by Google; registration is instant, no billing needed
// for the free tier) and set TENOR_API_KEY in .env.local.
const TENOR_BASE = "https://tenor.googleapis.com/v2";

export function isGifSearchConfigured() {
  return Boolean(process.env.TENOR_API_KEY);
}

export async function searchGifs(query, limit = 20) {
  if (!isGifSearchConfigured()) return [];
  const url = `${TENOR_BASE}/search?q=${encodeURIComponent(query)}&key=${process.env.TENOR_API_KEY}&client_key=linkedout&limit=${limit}&media_filter=gif,tinygif`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("GIF search failed.");
  const data = await res.json();
  return (data.results || []).map((r) => ({
    id: r.id,
    title: r.content_description || "",
    url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
    previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
    width: r.media_formats?.tinygif?.dims?.[0] || 200,
    height: r.media_formats?.tinygif?.dims?.[1] || 200,
  })).filter((g) => g.url);
}

export async function trendingGifs(limit = 20) {
  if (!isGifSearchConfigured()) return [];
  const url = `${TENOR_BASE}/featured?key=${process.env.TENOR_API_KEY}&client_key=linkedout&limit=${limit}&media_filter=gif,tinygif`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("GIF search failed.");
  const data = await res.json();
  return (data.results || []).map((r) => ({
    id: r.id,
    title: r.content_description || "",
    url: r.media_formats?.gif?.url || r.media_formats?.tinygif?.url,
    previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url,
    width: r.media_formats?.tinygif?.dims?.[0] || 200,
    height: r.media_formats?.tinygif?.dims?.[1] || 200,
  })).filter((g) => g.url);
}
