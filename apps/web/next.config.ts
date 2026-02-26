import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Workspace linting is run via `pnpm -r lint`; skip duplicate build-time lint.
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
