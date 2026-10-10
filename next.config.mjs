/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output bundles a minimal server + only the deps actually
  // used, which is what the Dockerfile below is built around — a much
  // smaller, more reliable image than copying the whole node_modules tree.
  output: "standalone",
  // Lets the dev server serve JS/CSS/HMR to devices on your LAN (e.g.
  // your phone) when you open it via your computer's IP instead of
  // localhost. Dev-only setting — has no effect on `npm run build`/`start`
  // or the deployed app, and is safe to leave in.
  allowedDevOrigins: ["192.168.0.105"],
  // Private app areas must never appear in search results. A header (unlike a robots.txt Disallow)
  // still works when another site links to the page, because crawlers are allowed to see it.
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return ["/messages", "/settings", "/notifications", "/profile", "/my-stories", "/my-stories/:path*", "/alerts", "/verify-employment", "/redeem-invite", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/support", "/stories/new", "/circles/:slug/manage", "/companies/:id/business", "/admin/:path*", "/api/:path*"]
      .map((source) => ({ source, headers: noindex }));
  },
};

export default nextConfig;
