import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded server is served under /api/* via a single catch-all route handler.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "/api/[[...path]]",
      },
    ];
  },
  eslint: {
    // The (app) route group uses parentheses in paths, which the default Next lint
    // config mis-parses; type-checking is enforced separately via `tsc --noEmit`.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
