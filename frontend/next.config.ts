import type { NextConfig } from "next";

// The browser calls the API at /api on this origin and Next.js proxies it to the backend. Same origin keeps the
// HttpOnly session cookie first-party (SameSite=Lax).
const API_ORIGIN = (process.env.API_ORIGIN ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
