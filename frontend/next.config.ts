import type { NextConfig } from "next";

// The browser calls the API at /api on this origin and Next.js proxies it to the backend. Same origin keeps the
// HttpOnly session cookie first-party (SameSite=Lax). On Vercel without API_ORIGIN, the deployed Render API is used.
const DEPLOYED_API = "https://japita-api.onrender.com";
const API_ORIGIN = (process.env.API_ORIGIN?.trim() || (process.env.VERCEL ? DEPLOYED_API : "http://localhost:8000"))
  .replace(/\/$/, "");

console.log(`[japita] /api proxies to ${API_ORIGIN}`);

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
