// Runs before the matched requests (Next.js 16 "proxy", the successor to middleware).
//
// /sitemap.xml is only meant for search engines. People and scrapers who open it get a 404; the
// big crawlers get it normally. A user-agent check can be faked, so this keeps the list from being
// casually browsed or harvested; it is not a security boundary (nothing in it is private: every URL
// listed is already a public page). Verify the sitemap in Google Search Console / Bing Webmaster as usual.
// Set SITEMAP_PUBLIC=true to turn the restriction off.
import { NextResponse } from "next/server";

const CRAWLERS = /(googlebot|google-inspectiontool|storebot-google|adsbot-google|bingbot|bingpreview|msnbot|duckduckbot|yandex(bot)?|baiduspider|applebot|slurp|seznambot|petalbot|naverbot|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp)/i;

export function proxy(request) {
  if (process.env.SITEMAP_PUBLIC === "true") return NextResponse.next();
  const ua = request.headers.get("user-agent") || "";
  if (CRAWLERS.test(ua)) return NextResponse.next();
  return new NextResponse("Not found", { status: 404, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export const config = { matcher: ["/sitemap.xml"] };
