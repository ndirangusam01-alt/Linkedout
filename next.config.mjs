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
};

export default nextConfig;
