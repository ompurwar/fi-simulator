import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The embedded server is served under /api/* via a single catch-all route handler.
  async rewrites() {
    return [
      // OAuth metadata lives at {mcp}/.well-known/oauth-authorization-server but the
      // App Router ignores dot-prefixed folders — rewrite it to a static route. This
      // MUST precede the /api/:path* rewrite (first match wins).
      {
        source: "/api/mcp/.well-known/oauth-authorization-server",
        destination: "/api/mcp/oauth/metadata",
      },
      {
        source: "/api/mcp/.well-known/oauth-protected-resource",
        destination: "/api/mcp/oauth/protected-resource",
      },
      // Origin-relative discovery (Claude Code checks these BEFORE the path-relative
      // metadata): RFC 8414 authorization-server metadata + RFC 9728 protected-resource.
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/mcp/oauth/metadata",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/mcp/oauth/protected-resource",
      },
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
