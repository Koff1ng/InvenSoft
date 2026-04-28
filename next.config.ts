import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize native modules that can't run in serverless (Vercel)
  serverExternalPackages: ["better-sqlite3", "bcryptjs"],
};

export default nextConfig;
