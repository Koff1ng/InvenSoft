import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externalize native modules that can't run in serverless (Vercel)
  serverExternalPackages: ["better-sqlite3", "bcryptjs"],

  // Inject Supabase env vars for production builds (Vercel)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yykvutgtqiisbutmucwg.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5a3Z1dGd0cWlpc2J1dG11Y3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MTA4NDYsImV4cCI6MjA5MjQ4Njg0Nn0.ntBhTBrmrbdO7QTMXTQxPNFhJ3guNbpZuf44dTNoXhk",
  },
};

export default nextConfig;
